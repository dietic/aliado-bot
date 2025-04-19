import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function classify(text: string): Promise<{
  category: string;
  district: string | null;
}> {
  const fn = {
    name: "route_service",
    parameters: {
      type: "object",
      properties: {
        category: { type: "string" },
        district: { type: "string" },
      },
      required: ["category"],
    },
  };

  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    functions: [fn],
    function_call: { name: "route_service" },
    messages: [
      { role: "system", content: "Eres un router de servicios en Lima." },
      { role: "user", content: text },
    ],
  });

  const args = JSON.parse(
    res.choices[0].message.function_call!.arguments as string,
  );
  return { category: args.category, district: args.district ?? null };
}
