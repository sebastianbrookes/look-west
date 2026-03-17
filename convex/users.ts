import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const getActiveUsers = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("active"), true))
      .collect();
  },
});

export const getUserByPhone = query({
  args: { phone: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("phone"), args.phone))
      .first();
  },
});

export const addUser = mutation({
  args: {
    name: v.string(),
    phone: v.string(),
    latitude: v.number(),
    longitude: v.number(),
    locationName: v.string(),
    timezone: v.string(),
  },
  handler: async (ctx, args) => {
    const e164Regex = /^\+[1-9]\d{1,14}$/;
    if (!e164Regex.test(args.phone)) {
      throw new Error(
        "Phone number must be in E.164 format (e.g. +16175551234)"
      );
    }

    const existing = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("phone"), args.phone))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        name: args.name,
        active: true,
        latitude: args.latitude,
        longitude: args.longitude,
        locationName: args.locationName,
        timezone: args.timezone,
      });
      return existing._id;
    }

    return await ctx.db.insert("users", {
      ...args,
      active: true,
      createdAt: Date.now(),
    });
  },
});

export const toggleUserActive = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("User not found");
    await ctx.db.patch(args.userId, { active: !user.active });
  },
});

export const updateLocation = mutation({
  args: {
    userId: v.id("users"),
    latitude: v.number(),
    longitude: v.number(),
    locationName: v.string(),
    timezone: v.string(),
  },
  handler: async (ctx, args) => {
    const { userId, ...location } = args;
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found");
    await ctx.db.patch(userId, location);
  },
});
