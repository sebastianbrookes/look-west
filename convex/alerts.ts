import { query, internalQuery, internalMutation } from "./_generated/server";
import { v } from "convex/values";

export const getPendingAlerts = internalQuery({
  args: {},
  handler: async (ctx) => {
    const now = new Date().toISOString();
    const cutoff = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    const alerts = await ctx.db
      .query("alerts")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .collect();

    return alerts.filter(
      (a) => a.scheduledSendTime <= now && a.scheduledSendTime >= cutoff
    );
  },
});

export const expireStalePendingAlerts = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    const alerts = await ctx.db
      .query("alerts")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .collect();

    const stale = alerts.filter((a) => a.scheduledSendTime < cutoff);
    for (const alert of stale) {
      await ctx.db.patch(alert._id, {
        status: "expired",
        errorMessage: "Alert expired — not sent (scheduled send time too far in the past)",
      });
    }
    if (stale.length) {
      console.log(`Expired ${stale.length} stale pending alert(s)`);
    }
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

export const getTodaysAlertForUser = internalQuery({
  args: { userId: v.id("users"), timezone: v.string() },
  handler: async (ctx, args) => {
    // Compare dates in the user's local timezone to avoid UTC date-boundary mismatches
    const todayLocal = new Intl.DateTimeFormat("en-CA", {
      timeZone: args.timezone,
    }).format(new Date()); // "YYYY-MM-DD" in user's timezone

    const alerts = await ctx.db
      .query("alerts")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .order("desc")
      .collect();

    return (
      alerts.find((a) => {
        const sunsetDateLocal = new Intl.DateTimeFormat("en-CA", {
          timeZone: args.timezone,
        }).format(new Date(a.sunsetTime));
        return sunsetDateLocal === todayLocal;
      }) ?? null
    );
  },
});

export const logAlert = internalMutation({
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

export const updateAlertStatus = internalMutation({
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
