// api/webhook.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import twilio from "twilio";
import getRawBody from "raw-body";
import { parse } from "querystring";

import { classify } from "../src/libs/classifier";
import { getProvidersByCategory } from "../src/services/providerService";

// —— Env vars —————————————————————————————————————
const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN!;
const TWILIO_FROM = process.env.TWILIO_WHATSAPP_FROM!;
const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID!;

// —— Twilio client ——————————————————————————————————
const twilioClient = twilio(ACCOUNT_SID, AUTH_TOKEN);

// —— Handler —————————————————————————————————————
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(200).send("OK");
  }

  // 1) Raw‐body & signature validation
  const rawBuf = await getRawBody(req);
  const rawStr = rawBuf.toString("utf8");
  const params = parse(rawStr);

  const sigHeader = req.headers["x-twilio-signature"] as string | undefined;
  const fullUrl = "https://aliado-bot.vercel.app/api/webhook";
  if (
    sigHeader &&
    !twilio.validateRequest(AUTH_TOKEN, sigHeader, fullUrl, params)
  ) {
    console.error("🚨 Twilio signature mismatch", {
      fullUrl,
      rawStr,
      sigHeader,
    });
    return res.status(403).send("Invalid Twilio signature");
  }

  const from = params.From as string;
  const body = (params.Body as string).trim();

  try {
    // 2) Classify incoming text
    const ai = await classify(body);
    const categoryRaw = ai?.category;
    const district = ai?.district;

    if (!categoryRaw) {
      await twilioClient.messages.create({
        from: TWILIO_FROM,
        to: from,
        body: `Lo siento, no pude entender qué servicio necesitas.`,
      });
      return res.status(200).send("Delivered: unknown category");
    }

    // Normalize accents & uppercase for your slugs
    const normalizedCategory = categoryRaw
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase();

    // 3) Fetch providers via your service
    let providers;
    try {
      providers = await getProvidersByCategory(normalizedCategory, district);
    } catch (err) {
      console.error("❌ Error fetching providers", err);
      await twilioClient.messages.create({
        from: TWILIO_FROM,
        to: from,
        body: "Hubo un problema buscando proveedores. Intenta de nuevo más tarde.",
      });
      return res.status(500).send("Error fetching providers");
    }

    // 4) Build reply
    let replyText: string;
    if (!providers || providers.length === 0) {
      replyText =
        `No encontré proveedores para *${normalizedCategory}*` +
        (district ? ` en *${district}*.` : ".") +
        ``;
    } else {
      const lines = providers.map(
        (p, idx) => `${idx + 1}. ${p.firstName} ${p.lastName} — 📞 ${p.phone}`,
      );
      replyText =
        "Aquí tienes los proveedores disponibles:\n" + lines.join("\n");
    }

    // 5) Send it back via Twilio
    await twilioClient.messages.create({
      from: TWILIO_FROM,
      to: from,
      body: replyText,
    });

    return res.status(200).send("Delivered");
  } catch (e) {
    console.error("🚨 Unexpected server error", e);
    await twilioClient.messages.create({
      from: TWILIO_FROM,
      to: from,
      body: "Ocurrió un error interno. Por favor inténtalo más tarde.",
    });
    return res.status(500).send("Error on server");
  }
}
