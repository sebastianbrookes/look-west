import { internalQuery } from "./_generated/server";
import { v } from "convex/values";

export const getAlertsSentInRange = internalQuery({
  args: { startTime: v.number(), endTime: v.number() },
  handler: async (ctx, args) => {
    const alerts = await ctx.db
      .query("alerts")
      .withIndex("by_status", (q) => q.eq("status", "sent"))
      .collect();

    return alerts.filter(
      (a) =>
        a.createdAt >= args.startTime &&
        a.createdAt <= args.endTime &&
        a.test !== true
    );
  },
});

export const getNewSignupsInRange = internalQuery({
  args: { startTime: v.number(), endTime: v.number() },
  handler: async (ctx, args) => {
    const users = await ctx.db.query("users").collect();

    return users
      .filter(
        (u) => u.createdAt >= args.startTime && u.createdAt <= args.endTime
      )
      .map((u) => ({ name: u.name, locationName: u.locationName }));
  },
});

export const getTotalActiveUsers = internalQuery({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect();
    return users.filter((u) => u.active).length;
  },
});
