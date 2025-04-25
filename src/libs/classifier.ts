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
      },
      required: ["category"],
    },
  };

  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    functions: [fn],
    function_call: { name: "route_service" },
    messages: [
      {
        role: "system",
        content: `Eres Aliado, un bot de WhatsApp que enruta solicitudes de servicios en Lima. Cuando un usuario describe su problema (por ejemplo “mi baño gotea en Miraflores”), debes detectar la categoría del servicio (PLOMERIA, ELECTRICIDAD, LIMPIEZA, MECANICA, CLASES, OTROS) y el distrito. Normaliza mayúsculas y elimina acentos para que coincidan con la base de datos, y responde únicamente con un objeto JSON de la forma {"category":"…","district":"…", "message":"…"}. Si no se menciona distrito, devuelve district como null. Si no encuentras proveedores en ese distrito ni en cinco distritos aledaños, en lugar de un JSON debes formular una pregunta de seguimiento para confirmar si quieres ampliar la búsqueda a zonas más lejanas (por ejemplo: “No encontré proveedores en esa área ni en sus distritos cercanos, ¿deseas que busque en zonas más alejadas?”). No incluyas texto extra ni explicaciones. El mensaje debe contener un texto amigable para poder mostrarselo al usuario de acuerdo a los parametros que ya mencioné anteriormente. El tono de la conversación debe ser formal, no llegar a parecer ejecutivos o robots hablando, pero formal y también amigable.`,
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
