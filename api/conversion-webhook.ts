import type { VercelRequest, VercelResponse } from "@vercel/node";
import twilio from "twilio";
import getRawBody from "raw-body";
import { parse } from "querystring";

import { classify } from "../src/libs/classifier";
import { getProvidersByCategory } from "../src/services/providerService";

const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN!;
const TWILIO_FROM = process.env.TWILIO_WHATSAPP_FROM!;
const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID!;

const twilioClient = twilio(ACCOUNT_SID, AUTH_TOKEN);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(200).send("OK");
  }

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
    const ai = await classify(body);
    const categoryRaw = ai?.category.toLowerCase();
    const districtList = ai?.district; // now an array of strings

    if (!categoryRaw) {
      await twilioClient.messages.create({
        from: TWILIO_FROM,
        to: from,
        body: `Lo siento, no pude entender qué servicio necesitas.`,
      });
      return res.status(200).send("Delivered: unknown category");
    }

    const normalizedCategory = categoryRaw
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

    let providers;
    try {
      providers = await getProvidersByCategory(
        normalizedCategory,
        districtList,
      );
      console.log(providers);
    } catch (err) {
      console.error("❌ Error fetching providers", err);
      await twilioClient.messages.create({
        from: TWILIO_FROM,
        to: from,
        body: "Hubo un problema buscando proveedores. Intenta de nuevo más tarde.",
      });
      return res.status(500).send("Error fetching providers");
    }

    let replyText: string;
    if (!providers || providers.length === 0) {
      replyText =
        `No encontré proveedores para *${normalizedCategory}*` +
        (districtList?.[0] ? ` en *${districtList[0]}* y alrededores.` : ".");
    } else {
      const lines = providers.map(
        (p, idx) => `${idx + 1}. ${p.firstName} ${p.lastName} — 📞 ${p.phone}`,
      );
      replyText =
        "Aquí tienes los proveedores disponibles:\n" + lines.join("\n");
    }

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
