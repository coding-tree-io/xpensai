import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const listRecent = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 20;
    const expenses = await ctx.db
      .query("expenses")
      .order("desc")
      .take(limit);
    return await Promise.all(
      expenses.map(async (expense) => {
        if (!expense.receiptId) {
          return { ...expense, receiptUrl: null };
        }
        const receipt = await ctx.db.get(expense.receiptId);
        if (!receipt?.storageId) {
          return { ...expense, receiptUrl: null };
        }
        const receiptUrl = await ctx.storage.getUrl(receipt.storageId);
        return {
          ...expense,
          receiptUrl,
          receiptFilename: receipt.filename,
        };
      })
    );
  },
});

export const create = mutation({
  args: {
    receiptId: v.optional(v.id("receipts")),
    merchant: v.string(),
    date: v.string(),
    amount: v.number(),
    currency: v.string(),
    category: v.string(),
    vatNumber: v.optional(v.string()),
    vatRate: v.optional(v.number()),
    vatAmount: v.optional(v.number()),
    notes: v.optional(v.string()),
    confidence: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("expenses", {
      ...args,
      status: "approved",
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("expenses"),
    merchant: v.optional(v.string()),
    date: v.optional(v.string()),
    amount: v.optional(v.number()),
    currency: v.optional(v.string()),
    category: v.optional(v.string()),
    vatNumber: v.optional(v.string()),
    vatRate: v.optional(v.number()),
    vatAmount: v.optional(v.number()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { id, ...fields } = args;
    await ctx.db.patch(id, {
      ...fields,
      updatedAt: Date.now(),
    });
  },
});

export const get = query({
  args: { id: v.id("expenses") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const applyProcessingResult = mutation({
  args: {
    id: v.id("expenses"),
    merchant: v.string(),
    date: v.string(),
    amount: v.number(),
    currency: v.string(),
    category: v.string(),
    vatNumber: v.optional(v.string()),
    vatRate: v.optional(v.number()),
    vatAmount: v.optional(v.number()),
    confidence: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { id, ...fields } = args;
    await ctx.db.patch(id, {
      ...fields,
      status: "approved",
      updatedAt: Date.now(),
    });
  },
});

export const setStatus = mutation({
  args: {
    id: v.id("expenses"),
    status: v.string(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      status: args.status,
      notes: args.notes,
      updatedAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { id: v.id("expenses") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});
