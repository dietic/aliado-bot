// src/libs/classifier.ts

import OpenAI from "openai";
import { CATEGORIES } from "../config/categories";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

// Extract just the slugs from your config
const VALID_CATEGORIES = CATEGORIES.map((c) => c.slug);
export async function classify(text: string): Promise<{
  category: string;
  district: string[];
}> {
  // Define the function schema with an enum constraint on category
  const fn = {
    name: "route_service",
    parameters: {
      type: "object",
      properties: {
        category: {
          type: "string",
          enum: VALID_CATEGORIES,
          description:
            "Must be one of the pre-defined service slugs. Pick the best match.",
        },
        district: {
          type: "array",
          items: { type: "string" },
          description:
            "An array containing the requested Lima district plus four adjacent districts.",
        },
      },
      required: ["category", "district"],
    },
  };

  // System prompt: set the expectations and list valid categories
  const systemPrompt = `
Eres Aliado, el bot de WhatsApp que enruta servicios en Lima Metropolitana.
Cuando devuelvas JSON vía la función "route_service", asegúrate de:
 • category: uno de [${VALID_CATEGORIES.join(", ")}]
 • district: array de longitud 5 (distrito principal + 4 distritos aledaños).
`;

  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt.trim() },
      { role: "user", content: text },
    ],
    functions: [fn],
    function_call: { name: "route_service" },
  });

  // Parse and return
  const args = JSON.parse(
    res.choices[0].message.function_call!.arguments as string,
  );

  return {
    category: args.category,
    district: args.district,
  };
}

// export async function getNaturalReply(
//   provider: any,
// ): Promise<{ message: string }> {
//   const res = await openai.chat.completions.create({
//     model: "gpt-4o-mini",
//     messages: [
//       {
//         role: "system",
//         content:
//           "Eres Aliado, un bot conversacional de WhatsApp que enruta servicios en Lima. Debes devolver un JSON con category y district (district debe ser un array de el distrito más 4 distritos aledaños).",
//       },
//       {
//         role: "user",
//         content: `El usuario pidió ${category} en ${district}. Estos son los proveedores:\n${summary}\nRedacta un mensaje corto invitando a usarlo.`,
//       },
//     ],
//   });
// }
