// TODO: webhook handler entry
import type { VercelRequest, VercelResponse } from "@vercel/node";
import twilio from "twilio";

const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID!,
  process.env.TWILIO_AUTH_TOKEN!,
);
const twilioSignature = require("twilio").validateRequest;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // 1️⃣ Verify POST came from Twilio
  if (
    !twilioSignature(
      process.env.TWILIO_AUTH_TOKEN!,
      req.headers["x-twilio-signature"] as string,
      process.env.VERCEL_URL + req.url, // full URL
      req.body, // raw payload
    )
  ) {
    return res.status(403).send("Invalid Twilio signature");
  }

  // 2️⃣ Parse inbound WhatsApp message
  const from = req.body.From; // "whatsapp:+51..."
  const body = req.body.Body || "";

  // 3️⃣ Call your OpenAI classifier here -> { category, district }
  // const { category, district } = await classify(body);

  // 4️⃣ Fetch 3 providers from Supabase (pseudo)
  // const providers = await db.findProviders(category, district);

  // 5️⃣ Reply with contact cards (simple text for now)
  await twilioClient.messages.create({
    from: process.env.TWILIO_WHATSAPP_FROM,
    to: from,
    body: "Aquí están 3 plomeros en Miraflores:\n1. Juan - 987654321\n2. ...",
  });

  res.status(200).end();
}
