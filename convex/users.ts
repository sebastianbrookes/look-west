import {
  internalQuery,
  mutation,
  query,
  type MutationCtx,
} from "./_generated/server";
import { v } from "convex/values";
import { generateUnsubscribeToken } from "./unsubscribeTokens";

const DUPLICATE_ACTIVE_EMAIL_ERROR = "Email already registered";
const INVALID_UNSUBSCRIBE_TOKEN_ERROR = "Invalid unsubscribe link.";

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

function withoutUnsubscribeToken<
  T extends {
    unsubscribeToken: string;
  },
>(user: T) {
  const { unsubscribeToken: _unsubscribeToken, ...safeUser } = user;
  return safeUser;
}

async function issueUnsubscribeToken(ctx: MutationCtx) {
  while (true) {
    const token = generateUnsubscribeToken();
    const existing = await ctx.db
      .query("users")
      .withIndex("by_unsubscribeToken", (q) =>
        q.eq("unsubscribeToken", token)
      )
      .unique();

    if (!existing) {
      return token;
    }
  }
}

export const getActiveUsers = query({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("active"), true))
      .collect();

    return users.map(withoutUnsubscribeToken);
  },
});

export const getActiveUsersForDelivery = internalQuery({
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
    const user =
      users.find((existingUser) => normalizeEmail(existingUser.email) === normalizedEmail) ??
      null;

    return user ? withoutUnsubscribeToken(user) : null;
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

      const unsubscribeToken = await issueUnsubscribeToken(ctx);
      await ctx.db.patch(existing._id, {
        name: args.name,
        email: normalizedEmail,
        active: true,
        latitude: args.latitude,
        longitude: args.longitude,
        locationName: args.locationName,
        timezone: args.timezone,
        unsubscribeToken,
      });
      return existing._id;
    }

    const unsubscribeToken = await issueUnsubscribeToken(ctx);
    return await ctx.db.insert("users", {
      ...args,
      email: normalizedEmail,
      active: true,
      unsubscribeToken,
      createdAt: Date.now(),
    });
  },
});

export const unsubscribeByToken = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const token = args.token.trim();
    if (!token) {
      throw new Error(INVALID_UNSUBSCRIBE_TOKEN_ERROR);
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_unsubscribeToken", (q) =>
        q.eq("unsubscribeToken", token)
      )
      .unique();

    if (!user) {
      throw new Error(INVALID_UNSUBSCRIBE_TOKEN_ERROR);
    }

    if (user.active) {
      await ctx.db.patch(user._id, { active: false });
    }

    return { success: true };
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
