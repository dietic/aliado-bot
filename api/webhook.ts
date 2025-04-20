// Aliado WhatsApp Webhook (Twilio + Supabase + OpenAI)
// ----------------------------------------------------
// Expected runtime: Vercel serverless function (Node 20)
// Route:  https://<project>.vercel.app/api/webhook
// ----------------------------------------------------

import type { VercelRequest, VercelResponse } from "@vercel/node";
import twilio from "twilio";
import { classify } from "../src/libs/classifier";
import { db } from "../src/libs/db";

// Twilio client for outbound messages
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID!,
  process.env.TWILIO_AUTH_TOKEN!,
);

const TWILIO_FROM = process.env.TWILIO_WHATSAPP_FROM!;
const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN!;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Build the absolute URL Twilio called
  const fullUrl = `https://${process.env.VERCEL_URL}${req.url}`;

  // Validate signature only when Twilio sends it
  const sig = req.headers["x-twilio-signature"] as string | undefined;
  const bodyParams = (req.body as Record<string, string>) ?? {};

  if (sig && !twilio.validateRequest(AUTH_TOKEN, sig, fullUrl, bodyParams)) {
    return res.status(403).send("Invalid Twilio signature");
  }

  // Handle only POSTs from Twilio; ignore health checks / HEAD
  if (req.method !== "POST") return res.status(200).end();

  const from = bodyParams.From; // e.g., "whatsapp:+51..."
  const text = bodyParams.Body ?? "";

  // 1️⃣  Classify intent → { category, district }
  const { category, district } = await classify(text);

  // 2️⃣  Query providers table (Supabase) for matches
  const { data: providers, error } = await db
    .from("Provider")
    .select("firstName,lastName,phone")
    .contains("categories", [category])
    .ilike("district", district ?? "%")
    .limit(3);

  if (error) {
    console.error("Supabase error", error);
  }

  // 3️⃣  Craft reply
  const reply = providers?.length
    ? providers
        .map((p, i) => `${i + 1}. ${p.firstName} ${p.lastName} – ${p.phone}`)
        .join("\n")
    : "Lo siento, no encontré proveedores disponibles.";

  // 4️⃣  Send WhatsApp message back
  await twilioClient.messages.create({
    from: TWILIO_FROM,
    to: from,
    body: reply,
  });

  return res.status(200).end();
}
