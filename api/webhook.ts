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
  if (req.method !== "POST") return res.status(200).send("OK");

  const rawBuf = await getRawBody(req);
  const rawStr = rawBuf.toString("utf8");
  const params = parse(rawStr);

  const sigHeader = req.headers["x-twilio-signature"] as string | undefined;
  const fullUrl = "https://aliado-bot.vercel.app/api/webhook";

  // ✅ Correct signature validation
  if (
    sigHeader &&
    !twilio.validateRequest(AUTH_TOKEN, sigHeader, fullUrl, params)
  ) {
    console.error("Twilio signature mismatch", { fullUrl, rawStr, sigHeader });
    return res.status(403).send("Invalid Twilio signature");
  }

  const from = params.From as string;
  const body = (params.Body as string) || "";

  try {
    const openAIResponse = await classify(body);
    const category = openAIResponse?.category;
    const district = openAIResponse?.district;
    console.log("openAIResponse", openAIResponse);
    const normalizedCategory = category
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

    const { data: providers, error } = await db
      .from("Provider")
      .select("firstName,lastName,phone")
      .contains("categories", [normalizedCategory.toUpperCase()])
      .ilike("district", district ?? "%")
      .limit(3);

    if (error) console.error("Supabase error", error);

    const reply = providers?.length
      ? providers
          .map((p, i) => `${i + 1}. ${p.firstName} ${p.lastName} – ${p.phone}`)
          .join("\n")
      : "Lo siento, no encontré proveedores disponibles.";

    await twilioClient.messages.create({
      from: TWILIO_FROM,
      to: from,
      body: reply,
    });

    return res.status(200).send("Delivered");
  } catch (e) {
    console.log("e", e);
    return res.status(500).send("Error on server");
  }
}
