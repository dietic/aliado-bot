import type { VercelRequest, VercelResponse } from "@vercel/node";
import twilio from "twilio";
import { classify } from "../libs/classifier";
import { db } from "../libs/db";

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID!,
  process.env.TWILIO_AUTH_TOKEN!,
);
const validate = twilio.validateRequest;
const BASE = `https://${process.env.VERCEL_URL}`;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (
    !validate(
      process.env.TWILIO_AUTH_TOKEN!,
      req.headers["x-twilio-signature"] as string,
      BASE + req.url,
      req.body,
    )
  )
    return res.status(403).send("Invalid Twilio signature");

  const from = req.body.From as string;
  const body = (req.body.Body as string) ?? "";

  const { category, district } = await classify(body);

  const { data } = await db
    .from("Provider")
    .select("firstName,lastName,phone")
    .contains("categories", [category])
    .ilike("district", district ?? "%")
    .limit(3);

  const reply =
    data && data.length
      ? data
          .map((p, i) => `${i + 1}. ${p.firstName} ${p.lastName} – ${p.phone}`)
          .join("\n")
      : "Lo siento, no encontré proveedores disponibles.";

  await client.messages.create({
    from: process.env.TWILIO_WHATSAPP_FROM!,
    to: from,
    body: reply,
  });

  res.status(200).end();
}
