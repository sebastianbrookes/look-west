import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const getPendingAlerts = query({
  args: {},
  handler: async (ctx) => {
    const now = new Date().toISOString();
    const alerts = await ctx.db
      .query("alerts")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .collect();

    return alerts.filter((a) => a.scheduledSendTime <= now);
  },
});

export const getAlertHistory = query({
  args: {
    userId: v.id("users"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 20;
    return await ctx.db
      .query("alerts")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(limit);
  },
});

export const getTodaysAlertForUser = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const today = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD" in UTC

    const alerts = await ctx.db
      .query("alerts")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .order("desc")
      .collect();

    return alerts.find((a) => a.sunsetTime.slice(0, 10) === today) ?? null;
  },
});

export const logAlert = mutation({
  args: {
    userId: v.id("users"),
    sunsetTime: v.string(),
    scheduledSendTime: v.string(),
    qualityScore: v.number(),
    qualityLabel: v.string(),
    messageSent: v.string(),
    subjectLine: v.optional(v.string()),
    status: v.string(),
    test: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("alerts", {
      ...args,
      createdAt: Date.now(),
    });
  },
});

export const updateAlertStatus = mutation({
  args: {
    alertId: v.id("alerts"),
    status: v.string(),
    errorMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const update: { status: string; errorMessage?: string } = {
      status: args.status,
    };
    if (args.status === "error" && args.errorMessage) {
      update.errorMessage = args.errorMessage;
    }
    await ctx.db.patch(args.alertId, update);
  },
});
