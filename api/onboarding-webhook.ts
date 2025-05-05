// pages/api/onboarding-webhook.ts

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import Twilio from "twilio";

// ——————————————————————
// Configuración Supabase
// ——————————————————————
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!,
);

// ——————————————————————
// Handler principal
// ——————————————————————
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const twiml = new Twilio.twiml.MessagingResponse();
  const from = req.body.From as string;
  const text = ((req.body.Body as string) || "").trim();

  // Si Twilio no envía número o texto, cortamos
  if (!from) {
    twiml.message(
      "No pudimos identificar tu número. Intenta de nuevo más tarde.",
    );
    return sendResponse();
  }

  // 1) Leemos el estado de onboarding o lo creamos
  let { data: state, error } = await supabase
    .from("OnboardingState")
    .select("*")
    .eq("phone", from)
    .single();

  if (error && error.code === "PGRST116") {
    // no existe → creamos step=1
    const { data } = await supabase
      .from("OnboardingState")
      .insert({ phone: from, step: 1 });
    state = data![0];
  } else if (error) {
    // error de DB
    console.error(error);
    twiml.message("Error interno. Por favor intenta más tarde.");
    return sendResponse();
  }

  // 2) Flujo paso a paso con validaciones básicas
  switch (state.step) {
    case 1:
      // Pedimos y validamos nombre
      if (text.length < 3 || /\d/.test(text)) {
        twiml.message(
          "No entendí tu nombre. Por favor escribe tu nombre completo.",
        );
      } else {
        await supabase
          .from("OnboardingState")
          .update({ name: text, step: 2 })
          .eq("phone", from);
        twiml.message(
          "¿En qué distrito(s) trabajas? Envía uno o varios separados por comas.",
        );
      }
      break;

    case 2:
      // Pedimos y validamos distritos
      if (!text || text.length < 3) {
        twiml.message(
          "No entendí los distritos. Por favor envía uno o varios separados por comas.",
        );
      } else {
        await supabase
          .from("OnboardingState")
          .update({ districts: text, step: 3 })
          .eq("phone", from);
        twiml.message(
          "¿Qué categorías de servicio ofreces? (p.ej. plomería, electricidad)",
        );
      }
      break;

    case 3:
      // Pedimos y validamos categorías
      if (!text || text.length < 3) {
        twiml.message(
          "No entendí las categorías. Por favor escribe las que ofreces.",
        );
      } else {
        await supabase
          .from("OnboardingState")
          .update({ services: text, step: 4 })
          .eq("phone", from);
        twiml.message(
          "¿Tienes experiencia o certificaciones? Descríbelo brevemente.",
        );
      }
      break;

    case 4:
      // Pedimos y validamos experiencia
      if (!text || text.length < 5) {
        twiml.message("Por favor describe tu experiencia, aunque sea breve.");
      } else {
        // guardamos y enviamos resumen
        await supabase
          .from("OnboardingState")
          .update({ experience: text, step: 5 })
          .eq("phone", from);

        // recuperar datos para el resumen
        const { data: full } = await supabase
          .from("OnboardingState")
          .select("*")
          .eq("phone", from)
          .single();

        twiml.message(
          `Estos son tus datos:\n` +
            `• Nombre: ${full.name}\n` +
            `• Distritos: ${full.districts}\n` +
            `• Servicios: ${full.services}\n` +
            `• Experiencia: ${full.experience}\n\n` +
            `¿Todo correcto? Responde 1 para Sí o 2 para Corregir.`,
        );
      }
      break;

    case 5:
      // Confirmación o reinicio
      if (text === "1") {
        // Creamos el Aliado definitivo
        const { name, districts, services, experience } = state;
        await supabase.from("Provider").insert({
          firstName: name!.split(" ").slice(0, -1).join(" "),
          lastName: name!.split(" ").slice(-1).join(" "),
          dni: "", // si lo pides más adelante
          district: districts,
          phone: from,
          rating: 3.0,
          complaints: 0,
          available: false,
          handoffCount: 0,
        });
        twiml.message(
          `🎉 ¡Bienvenido, ${state.name}! Ahora eres un Aliado. Envía “DISPONIBLE” para empezar.`,
        );

        // limpiamos estado temporal
        await supabase.from("OnboardingState").delete().eq("phone", from);
      } else if (text === "2") {
        // Reiniciamos el onboarding
        await supabase
          .from("OnboardingState")
          .update({
            step: 1,
            name: null,
            districts: null,
            services: null,
            experience: null,
          })
          .eq("phone", from);
        twiml.message(
          "Entendido, empecemos de nuevo. ¿Cuál es tu nombre completo?",
        );
      } else {
        // Respuesta inválida
        twiml.message("No entendí. Responde 1 para Sí, 2 para Corregir.");
      }
      break;

    default:
      // Nunca debería pasar
      twiml.message("Ocurrió un error inesperado. Intenta de nuevo más tarde.");
  }

  // 3) Enviamos TwiML a Twilio
  sendResponse();

  function sendResponse() {
    res.writeHead(200, { "Content-Type": "text/xml" });
    res.end(twiml.toString());
  }
}
