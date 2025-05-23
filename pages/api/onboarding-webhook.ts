// pages/api/onboarding-webhook.ts

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import Twilio from "twilio";
import twilio from "twilio";
import OpenAI from "openai";
import { DISTRICTS } from "../../src/config/districts";
import { CATEGORIES } from "../../src/config/categories";

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN!;
const TWILIO_FROM = process.env.TWILIO_WHATSAPP_FROM!;
const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID!;
const joinAcceptanceText = "welcome_yes";
const joinDenialText = "welcome_no";
const VALID_DISTRICTS = DISTRICTS.map((d) => d.slug);
const VALID_CATEGORIES = CATEGORIES.map((c) => c.slug);
// ——————————————————————
// Configuración Supabase
// ——————————————————————
const supabase = createClient(supabaseUrl, supabaseKey!);
const twilioClient = Twilio(ACCOUNT_SID, AUTH_TOKEN);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
// ——————————————————————
// Handler principal
// ——————————————————————
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const twiml = new Twilio.twiml.MessagingResponse();
  const from = req.body.From as string;
  const text = ((req.body.Body as string) || "").trim();

  if (!from) {
    twiml.message(
      "No pudimos identificar tu número. Intenta de nuevo más tarde."
    );
    return sendResponse();
  }

  let { data: state, error } = await supabase
    .from("onboarding_state")
    .select("*")
    .eq("phone", from)
    .single();

  // that error means no users with that phone were found
  // there's still some work to do on the last if
  if (error && error.code === "PGRST116") {
    const joinAcceptance = req?.body?.ButtonPayload === joinAcceptanceText;
    const joinDenial = req?.body?.ButtonPayload === joinDenialText;
    if (joinAcceptance) {
      await twilioClient.messages.create({
        from: TWILIO_FROM,
        to: from,
        body: "Perfecto, vamos a registrate!",
      });
      try {
        const { data: user } = await supabase
          .from("onboarding_state")
          .insert({ phone: from, step: 1 })
          .select();
        state = user?.[0]!;
      } catch (error) {
        twiml.message("Error interno. Por favor intenta más tarde.");
        return sendResponse();
      }
    } else if (joinDenial) {
      await twilioClient.messages.create({
        from: TWILIO_FROM,
        to: from,
        body: "No te preocupes. Puedes encontrar más información de nosotros a través de nuestra web: htts://aliado.pe",
      });
    } else {
      await twilioClient.messages.create({
        contentSid: "HXd9d561eb7a8da35d97de06d116860ded",
        from: TWILIO_FROM,
        to: from,
      });
    }
  }

  switch (state.step) {
    case 1:
      await supabase
        .from("onboarding_state")
        .update({ name: text, step: 2 })
        .eq("phone", from);
      twiml.message("¿Cuál es tu nombre completo?");
      break;

    case 2:
      await supabase
        .from("onboarding_state")
        .update({ name: text, step: 3 })
        .eq("phone", from);
      twiml.message("¿En qué distrito(s) trabajas?");
      break;
    case 3:
      await supabase
        .from("onboarding_state")
        .update({ districts: text, step: 4 })
        .eq("phone", from);
      twiml.message("Perfecto, ¿qué servicios ofreces?");
      break;
    case 4:
      await supabase
        .from("onboarding_state")
        .update({ services: text })
        .eq("phone", from);
      const { data: raw } = await supabase
        .from("onboarding_state")
        .select("name,districts,services")
        .eq("phone", from)
        .single();

      const userObj = {
        name: raw?.name,
        districts: raw?.districts,
        services: raw?.services,
      };
      console.log("userObj", JSON.stringify(userObj));
      const fn = {
        name: "parse_user_response",
        parameters: {
          type: "object",
          properties: {
            // returning properties
            name: {
              type: "string",
              description:
                "Nombre completo. Separalo lo mejor posible en nombres y apellidos",
            },
            districts: {
              type: "array",
              items: {
                type: "string",
                enum: VALID_DISTRICTS,
              },
              description: [
                "Array de slugs de distritos válidos.",
                "Extrae uno o varios servicios del texto de entrada.",
                "No inventes categorías: si no hay match, devuelve un array vacío.",
              ].join(" "),
            },
            services: {
              type: "array",
              items: {
                type: "string",
                enum: VALID_CATEGORIES,
              },
              description: [
                "Array de slugs de servicio válidos.",
                "Extrae uno o varios servicios del texto de entrada.",
                "No inventes categorías: si no hay match, devuelve un array vacío.",
              ].join(" "),
            },
          },
          required: ["name", "districts", "services"],
        },
      };
      const systemPrompt = `
   You are a data cleaner. Correct typos and standardize the following JSON values.
   Output only the corrected JSON object.
      `;
      const res = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt.trim() },
          { role: "user", content: JSON.stringify(userObj) },
        ],
        functions: [fn],
        function_call: { name: fn.name },
      });
      const cleaned = JSON.parse(
        res?.choices?.[0]?.message?.function_call?.arguments || ""
      );
      await supabase
        .from("onboarding_state")
        .update({
          name: cleaned.name,
          districts: cleaned.districts,
          services: cleaned.services,
          // step: 5,
        })
        .eq("phone", from);

      const { data: provider, error: providerError } = await supabase
        .from("providers")
        .insert({
          firstName: cleaned.name!.split(" ").slice(0, -1).join(" "),
          lastName: cleaned.name!.split(" ").slice(-1).join(" "),
          phone: from,
        })
        .select()
        .single();

      if (!provider) {
        throw new Error("Provider was not created successfully");
      }

      const { data: categories, error: catQueryErr } = await supabase
        .from("categories")
        .select("id, slug")
        .in("slug", cleaned.services);

      if (!categories) throw new Error("Failed to fetch categories");

      const categoryLinks = categories.map((cat) => ({
        provider_id: provider.id,
        category_id: cat.id,
      }));

      const { data: insertedCategories, error: catInsertErr } = await supabase
        .from("provider_categories")
        .insert(categoryLinks);

      const { data: districts, error: distQueryErr } = await supabase
        .from("districts")
        .select("id, slug")
        .in("slug", cleaned.districts);

      if (!districts) throw new Error("Failed to fetch districts");

      const districtLinks = districts.map((d) => ({
        provider_id: provider.id,
        district_id: d.id,
      }));

      const { data: insertedDistricts, error: districtInsertErr } =
        await supabase.from("provider_districts").insert(districtLinks);

      twiml.message(
        `*¡Bienvenido 🎉 !*\n\n` +
          `Estos son lost datos que nos has dado:\n\n` +
          `*• Nombre:* ${cleaned.name}\n` +
          `*• Distritos:* ${cleaned.districts}\n` +
          `*• Servicios:* ${cleaned.services}\n\n` +
          `Si deseas ajustar algo ingresa a https://aliado.app/mi-cuenta`
      );
      // await supabase.from("onboarding_state").delete().eq("phone", from);
      break;

    default:
      twiml.message("Error inesperado. Intenta nuevamente más tarde.");
  }

  sendResponse();

  function sendResponse() {
    res.writeHead(200, { "Content-Type": "text/xml" });
    res.end(twiml.toString());
  }
}
