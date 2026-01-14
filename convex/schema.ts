import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  receipts: defineTable({
    storageId: v.optional(v.id("_storage")),
    filename: v.string(),
    mimeType: v.string(),
    status: v.string(),
    ocrResult: v.optional(v.any()),
    retryCount: v.optional(v.number()),
    createdAt: v.number(),
  }).index("by_status", ["status"]),
  expenses: defineTable({
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
    status: v.string(),
    confidence: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_created_at", ["createdAt"]),
});
