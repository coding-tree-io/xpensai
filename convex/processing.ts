import { action } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";
import { defaultCategories } from "../lib/categories";

export const processReceipt = action({
  args: {
    receiptId: v.id("receipts"),
    expenseId: v.id("expenses"),
  },
  handler: async (ctx, args) => {
    const receipt = await ctx.runQuery(api.receipts.get, {
      id: args.receiptId,
    });
    if (!receipt) {
      await failAndMaybeRetry("Receipt record is missing.", 0);
      return;
    }

    if (!receipt.storageId) {
      await failAndMaybeRetry("Receipt file is missing.", receipt.retryCount ?? 0);
      return;
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      await failAndMaybeRetry("OPENAI_API_KEY is not set.", receipt.retryCount ?? 0);
      return;
    }

    const receiptUrl = await ctx.storage.getUrl(receipt.storageId);
    if (!receiptUrl) {
      await failAndMaybeRetry("Unable to fetch receipt.", receipt.retryCount ?? 0);
      return;
    }

    const receiptResponse = await fetch(receiptUrl);
    if (!receiptResponse.ok) {
      await failAndMaybeRetry("Receipt download failed.", receipt.retryCount ?? 0);
      return;
    }

    const contentType =
      receipt.mimeType ||
      receiptResponse.headers.get("content-type") ||
      "image/png";
    const arrayBuffer = await receiptResponse.arrayBuffer();
    const isPdf =
      contentType === "application/pdf" ||
      receipt.filename.toLowerCase().endsWith(".pdf");
    const base64 = isPdf ? null : Buffer.from(arrayBuffer).toString("base64");
    const dataUrl = base64 ? `data:${contentType};base64,${base64}` : null;

    let fileId: string | null = null;
    if (isPdf) {
      const fileForm = new FormData();
      fileForm.append("purpose", "assistants");
      fileForm.append(
        "file",
        new Blob([arrayBuffer], { type: contentType }),
        receipt.filename || "receipt.pdf"
      );

      const fileResponse = await fetch("https://api.openai.com/v1/files", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        body: fileForm,
      });

      if (!fileResponse.ok) {
        await failAndMaybeRetry("OpenAI file upload failed.", receipt.retryCount ?? 0);
        return;
      }

      const fileData = (await fileResponse.json()) as { id?: string };
      if (!fileData.id) {
        await failAndMaybeRetry(
          "OpenAI file upload returned no file ID.",
          receipt.retryCount ?? 0
        );
        return;
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
      `Filename: ${receipt.filename}`,
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
      await failAndMaybeRetry("OpenAI request failed.", receipt.retryCount ?? 0);
      return;
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
        .find((text) => text && text.trim()) ?? openaiData.output_text;

    if (!outputText) {
      await failAndMaybeRetry("OpenAI response missing output.", receipt.retryCount ?? 0);
      return;
    }

    let parsed: {
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

    try {
      parsed = JSON.parse(outputText);
    } catch {
      await failAndMaybeRetry("Invalid JSON from OpenAI.", receipt.retryCount ?? 0);
      return;
    }

    await ctx.runMutation(api.expenses.applyProcessingResult, {
      id: args.expenseId,
      merchant: parsed.merchant,
      date: parsed.date,
      amount: parsed.amount,
      currency: parsed.currency,
      category: parsed.category,
      vatNumber: parsed.vatNumber ?? undefined,
      vatRate: parsed.vatRate ?? undefined,
      vatAmount: parsed.vatAmount ?? undefined,
      confidence: parsed.confidence,
    });

    await ctx.runMutation(api.receipts.setOcrResult, {
      receiptId: args.receiptId,
      status: "processed",
      ocrResult: parsed,
    });

    async function failAndMaybeRetry(errorMessage: string, currentRetryCount: number) {
      const maxAttempts = 4;
      const attempt = currentRetryCount + 1;
      const backoffSeconds = [10, 30, 120, 300];
      const shouldRetry = attempt <= maxAttempts;

      await ctx.runMutation(api.receipts.updateProcessingState, {
        receiptId: args.receiptId,
        status: shouldRetry ? "processing" : "failed",
        retryCount: attempt,
        ocrResult: {
          error: errorMessage,
          attempt,
          willRetry: shouldRetry,
        },
      });

      if (shouldRetry) {
        const delayMs =
          (backoffSeconds[attempt - 1] ?? backoffSeconds[backoffSeconds.length - 1]) *
          1000;
        await ctx.scheduler.runAfter(delayMs, api.processing.processReceipt, {
          receiptId: args.receiptId,
          expenseId: args.expenseId,
        });
        return;
      }

      await ctx.runMutation(api.expenses.setStatus, {
        id: args.expenseId,
        status: "failed",
        notes: "Auto-processing failed. Please edit the expense.",
      });
    }
  },
});

export const reprocessExpense = action({
  args: {
    expenseId: v.id("expenses"),
  },
  handler: async (ctx, args) => {
    const expense = await ctx.runQuery(api.expenses.get, {
      id: args.expenseId,
    });
    if (!expense?.receiptId) {
      return;
    }

    await ctx.runMutation(api.expenses.setStatus, {
      id: args.expenseId,
      status: "processing",
      notes: "Reprocessing receipt.",
    });
    await ctx.runMutation(api.receipts.resetForReprocess, {
      receiptId: expense.receiptId,
    });
    await ctx.scheduler.runAfter(0, api.processing.processReceipt, {
      receiptId: expense.receiptId,
      expenseId: args.expenseId,
    });
  },
});
