import { internalMutation, internalQuery, mutation } from "./_generated/server";
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

export const getRandomQuote = internalQuery({
  args: {},
  handler: async (ctx) => {
    const quotes = await ctx.db.query("quotes").collect();
    const visible = quotes.filter((q) => !q.hidden);
    if (visible.length === 0) return null;
    const index = Math.floor(Math.random() * visible.length);
    return visible[index];
  },
});

export const getQuoteCount = internalQuery({
  args: {},
  handler: async (ctx) => {
    const quotes = await ctx.db.query("quotes").collect();
    return quotes.length;
  },
});

export const hideQuote = internalMutation({
  args: { id: v.id("quotes") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { hidden: true });
  },
});