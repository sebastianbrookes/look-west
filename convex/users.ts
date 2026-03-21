import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

const DUPLICATE_ACTIVE_EMAIL_ERROR = "Email already registered";

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function normalizeLocationName(locationName: string) {
  return locationName.trim().toLowerCase();
}

function hasLocationChanged(
  existing: {
    latitude: number;
    longitude: number;
    locationName: string;
    timezone: string;
  },
  next: {
    latitude: number;
    longitude: number;
    locationName: string;
    timezone: string;
  }
) {
  return (
    existing.latitude !== next.latitude ||
    existing.longitude !== next.longitude ||
    existing.timezone !== next.timezone ||
    normalizeLocationName(existing.locationName) !==
      normalizeLocationName(next.locationName)
  );
}

export const getActiveUsers = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("active"), true))
      .collect();
  },
});

export const getUserByEmail = query({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const normalizedEmail = normalizeEmail(args.email);
    const users = await ctx.db.query("users").collect();
    return users.find((user) => normalizeEmail(user.email) === normalizedEmail) ?? null;
  },
});

export const addUser = mutation({
  args: {
    name: v.string(),
    email: v.string(),
    latitude: v.number(),
    longitude: v.number(),
    locationName: v.string(),
    timezone: v.string(),
  },
  handler: async (ctx, args) => {
    const normalizedEmail = normalizeEmail(args.email);
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      throw new Error("Please enter a valid email address.");
    }

    const users = await ctx.db.query("users").collect();
    const existing =
      users.find((user) => normalizeEmail(user.email) === normalizedEmail) ?? null;

    if (existing) {
      if (existing.active) {
        if (!hasLocationChanged(existing, args)) {
          throw new Error(DUPLICATE_ACTIVE_EMAIL_ERROR);
        }

        await ctx.db.patch(existing._id, {
          name: args.name,
          email: normalizedEmail,
          latitude: args.latitude,
          longitude: args.longitude,
          locationName: args.locationName,
          timezone: args.timezone,
        });
        return existing._id;
      }

      await ctx.db.patch(existing._id, {
        name: args.name,
        email: normalizedEmail,
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
      email: normalizedEmail,
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
