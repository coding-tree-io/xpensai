import { defaultCategories } from "@/lib/categories";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "OPENAI_API_KEY is not set." },
      { status: 500 }
    );
  }

  const formData = await req.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "Missing file." }, { status: 400 });
  }

  const contentType = file.type || "image/png";
  const arrayBuffer = await file.arrayBuffer();
  const isPdf = contentType === "application/pdf";
  const base64 = isPdf ? null : Buffer.from(arrayBuffer).toString("base64");
  const dataUrl = base64 ? `data:${contentType};base64,${base64}` : null;

  let fileId: string | null = null;
  if (isPdf) {
    const fileForm = new FormData();
    fileForm.append("purpose", "assistants");
    fileForm.append(
      "file",
      new Blob([arrayBuffer], { type: contentType }),
      file.name || "receipt.pdf"
    );

    const fileResponse = await fetch("https://api.openai.com/v1/files", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: fileForm,
    });

    if (!fileResponse.ok) {
      const errorText = await fileResponse.text();
      return Response.json(
        {
          error: "OpenAI file upload failed.",
          status: fileResponse.status,
          details: errorText.slice(0, 500),
        },
        { status: 502 }
      );
    }

    const fileData = (await fileResponse.json()) as { id?: string };
    if (!fileData.id) {
      return Response.json(
        { error: "OpenAI file upload returned no file ID." },
        { status: 502 }
      );
    }
    fileId = fileData.id;
  }

  const schema = {
    type: "object",
    properties: {
      merchant: { type: "string" },
      date: { type: "string", description: "ISO date (YYYY-MM-DD)" },
      amount: { type: "number" },
      currency: { type: "string" },
      category: { type: "string", enum: defaultCategories },
      vatNumber: { type: ["string", "null"] },
      vatRate: { type: ["number", "null"] },
      vatAmount: { type: ["number", "null"] },
      confidence: { type: "number", minimum: 0, maximum: 1 },
    },
    required: [
      "merchant",
      "date",
      "amount",
      "currency",
      "category",
      "vatNumber",
      "vatRate",
      "vatAmount",
      "confidence",
    ],
    additionalProperties: false,
  } as const;

  const prompt = [
    "You extract fields from receipts.",
    "Return JSON that matches the provided schema exactly.",
    "If VAT number is missing, return null for vatNumber.",
    "If VAT rate is missing, return null for vatRate.",
    "If VAT amount is missing, return null for vatAmount.",
    "If currency is missing, infer from receipt locale or use USD.",
    "Confidence is your overall extraction confidence from 0 to 1.",
    "Category must be one of: " + defaultCategories.join(", "),
    `Filename: ${file.name}`,
  ].join("\n");

  const openaiResponse = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-5.1",
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: prompt },
            ...(fileId
              ? [{ type: "input_file", file_id: fileId }]
              : dataUrl
              ? [{ type: "input_image", image_url: dataUrl }]
              : []),
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "receipt_extract",
          schema,
          strict: true,
        },
      },
    }),
  });

  if (!openaiResponse.ok) {
    const errorText = await openaiResponse.text();
    return Response.json(
      {
        error: "OpenAI request failed.",
        status: openaiResponse.status,
        details: errorText.slice(0, 500),
      },
      { status: 502 }
    );
  }

  const openaiData = (await openaiResponse.json()) as {
    output?: Array<{
      content?: Array<{ text?: string; type?: string }>;
    }>;
    output_text?: string;
  };
  const outputText =
    openaiData.output
      ?.flatMap((item) => item.content ?? [])
      .map((content) => content.text)
      .find((text) => text && text.trim()) ??
    openaiData.output_text;
  if (!outputText) {
    return Response.json(
      {
        error: "OpenAI response missing output.",
        details: JSON.stringify(openaiData).slice(0, 500),
      },
      { status: 502 }
    );
  }

  try {
    const parsed = JSON.parse(outputText) as {
      merchant: string;
      date: string;
      amount: number;
      currency: string;
      category: string;
      vatNumber: string | null;
      vatRate: number | null;
      vatAmount: number | null;
      confidence: number;
    };

    return Response.json(parsed);
  } catch {
    return Response.json(
      {
        error: "Invalid JSON from OpenAI.",
        details: outputText.slice(0, 500),
      },
      { status: 502 }
    );
  }
}
