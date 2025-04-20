// Aliado WhatsApp Webhook — Twilio + Supabase + OpenAI
// ------------------------------------------------------
// Path   : /api/webhook
// Runtime: Vercel (serverless — Node 20)
// NOTE   : Uses raw‑body so Twilio signature validation works.
// ------------------------------------------------------

import type { VercelRequest, VercelResponse } from "@vercel/node";
import twilio from "twilio";
import getRawBody from "raw-body";
import { parse } from "querystring";

import { classify } from "../src/libs/classifier";
import { db } from "../src/libs/db";

// ---- Env ------------------------------------------------------------------
const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN!;
const TWILIO_FROM = process.env.TWILIO_WHATSAPP_FROM!;
const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID!;

// ---- Clients --------------------------------------------------------------
const twilioClient = twilio(ACCOUNT_SID, AUTH_TOKEN);

// ---- Handler --------------------------------------------------------------
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // We only process POSTs from Twilio
  if (req.method !== "POST") return res.status(200).send("OK");

  // 1️⃣  Obtain raw body (Twilio signs the raw x‑www‑form‑urlencoded string)
  const rawBuf = await getRawBody(req);
  const rawStr = rawBuf.toString("utf8");
  const params = parse(rawStr);

  // 2️⃣  Signature validation (skip if header absent — handy for local curl)
  const sigHeader = req.headers["x-twilio-signature"] as string | undefined;
  const fullUrl = `https://${req.headers.host}${req.url}`;

  if (
    sigHeader &&
    !twilio.validateRequest(AUTH_TOKEN, sigHeader, fullUrl, { rawStr })
  ) {
    return res.status(403).send("Invalid Twilio signature");
  }

  // 3️⃣  Extract basic fields
  const from = params.From as string; // whatsapp:+51...
  const body = (params.Body as string) || "";

  // 4️⃣  NLU — ask OpenAI to classify category + district
  const { category, district } = await classify(body);

  // 5️⃣  Query matching providers
  const { data: providers, error } = await db
    .from("Provider")
    .select("firstName,lastName,phone")
    .contains("categories", [category])
    .ilike("district", district ?? "%")
    .limit(3);

  if (error) console.error("Supabase error", error);

  // 6️⃣  Craft response text
  const reply = providers?.length
    ? providers
        .map((p, i) => `${i + 1}. ${p.firstName} ${p.lastName} – ${p.phone}`)
        .join("\n")
    : "Lo siento, no encontré proveedores disponibles.";

  // 7️⃣  Send outbound WhatsApp message
  await twilioClient.messages.create({
    from: TWILIO_FROM,
    to: from,
    body: reply,
  });

  return res.status(200).send("Delivered");
}
