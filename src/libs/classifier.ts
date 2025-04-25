import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function classify(text: string): Promise<{
  category: string;
  district: string | null;
  message: string;
}> {
  const fn = {
    name: "route_service",
    parameters: {
      type: "object",
      properties: {
        category: { type: "string" },
        district: { type: "string" },
        message: { type: "string" },
      },
      required: ["category", "message"],
    },
  };

  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    functions: [fn],
    function_call: { name: "route_service" },
    messages: [
      {
        role: "system",
        content:
          "Eres Aliado, un bot conversacional de WhatsApp que enruta servicios en Lima. Debes devolver un JSON con category, district y un mensaje en lenguaje natural para el usuario. Si no encuentras proveedores en ese distrito ni en cinco distritos aledaños, formula una pregunta de seguimiento para ampliar la búsqueda a zonas más lejanas. Esa pregunta también debe venir en el parámtro de mensaje",
      },
      { role: "user", content: text },
    ],
  });

  const args = JSON.parse(
    res.choices[0].message.function_call!.arguments as string,
  );
  return {
    category: args.category,
    district: args.district ?? null,
    message: args.message,
  };
}
