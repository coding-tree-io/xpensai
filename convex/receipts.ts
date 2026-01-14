import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";
import { defaultCategories } from "../lib/categories";

export const create = mutation({
  args: {
    storageId: v.optional(v.id("_storage")),
    filename: v.string(),
    mimeType: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("receipts", {
      ...args,
      status: "uploaded",
      retryCount: 0,
      createdAt: Date.now(),
    });
  },
});

export const createAndEnqueue = mutation({
  args: {
    storageId: v.id("_storage"),
    filename: v.string(),
    mimeType: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const receiptId = await ctx.db.insert("receipts", {
      ...args,
      status: "processing",
      retryCount: 0,
      createdAt: now,
    });

    const expenseId = await ctx.db.insert("expenses", {
      receiptId,
      merchant: "Processing...",
      date: new Date(now).toISOString().slice(0, 10),
      amount: 0,
      currency: "USD",
      category: defaultCategories[defaultCategories.length - 1] ?? "Miscellaneous",
      status: "processing",
      createdAt: now,
      updatedAt: now,
    });

    await ctx.scheduler.runAfter(0, api.processing.processReceipt, {
      receiptId,
      expenseId,
    });

    return { receiptId, expenseId };
  },
});

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

export const setOcrResult = mutation({
  args: {
    receiptId: v.id("receipts"),
    status: v.string(),
    ocrResult: v.any(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.receiptId, {
      status: args.status,
      ocrResult: args.ocrResult,
    });
  },
});

export const updateProcessingState = mutation({
  args: {
    receiptId: v.id("receipts"),
    status: v.string(),
    ocrResult: v.any(),
    retryCount: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.receiptId, {
      status: args.status,
      ocrResult: args.ocrResult,
      retryCount: args.retryCount,
    });
  },
});

export const resetForReprocess = mutation({
  args: {
    receiptId: v.id("receipts"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.receiptId, {
      status: "processing",
      retryCount: 0,
      ocrResult: null,
    });
  },
});

export const listRecent = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 20;
    return await ctx.db.query("receipts").order("desc").take(limit);
  },
});

export const get = query({
  args: { id: v.id("receipts") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});
