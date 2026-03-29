import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

export const insertQuote = internalMutation({
  args: {
    text: v.string(),
    author: v.string(),
    source: v.optional(v.string()),
    year: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Dedup: skip if a quote with identical text already exists
    const existing = await ctx.db
      .query("quotes")
      .filter((q) => q.eq(q.field("text"), args.text))
      .first();
    if (existing) {
      return { inserted: false, id: existing._id };
    }
    const id = await ctx.db.insert("quotes", args);
    return { inserted: true, id };
  },
});

export const getQuoteCount = internalQuery({
  args: {},
  handler: async (ctx) => {
    const quotes = await ctx.db.query("quotes").collect();
    return quotes.length;
  },
});
