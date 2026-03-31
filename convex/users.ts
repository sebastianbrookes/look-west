import {
  internalMutation,
  internalQuery,
  mutation,
  type MutationCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { ConvexError, v } from "convex/values";
import { generateUnsubscribeToken } from "./unsubscribeTokens";
import { rateLimit } from "./rateLimit";

const DUPLICATE_ACTIVE_EMAIL_ERROR = "Account already active";
const RATE_LIMIT_ERROR = "Too many signup attempts. Please try again later.";
const INVALID_UNSUBSCRIBE_TOKEN_ERROR = "Invalid unsubscribe link.";

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

type UserWithMaybeToken = Doc<"users">;

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

export const getActiveUsersForDelivery = internalQuery({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("active"), true))
      .collect();

    return users.filter(
      (user): user is UserWithMaybeToken & { unsubscribeToken: string } =>
        typeof user.unsubscribeToken === "string" && user.unsubscribeToken.length > 0
    );
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
      throw new ConvexError("Please enter a valid email address.");
    }

    const users = await ctx.db.query("users").collect();
    const existing =
      users.find((user) => normalizeEmail(user.email) === normalizedEmail) ?? null;

    if (existing) {
      if (existing.active) {
        throw new ConvexError(DUPLICATE_ACTIVE_EMAIL_ERROR);
      }

      const { ok } = await rateLimit(ctx, { name: "signupGlobal" });
      if (!ok) {
        throw new ConvexError(RATE_LIMIT_ERROR);
      }

      const unsubscribeToken = await issueUnsubscribeToken(ctx);
      await ctx.db.patch(existing._id, {
        name: args.name,
        email: normalizedEmail,
        active: false,
        latitude: args.latitude,
        longitude: args.longitude,
        locationName: args.locationName,
        timezone: args.timezone,
        unsubscribeToken,
      });
      await ctx.scheduler.runAfter(0, internal.emails.sendWelcomeEmail, {
        name: args.name,
        email: normalizedEmail,
        locationName: args.locationName,
        unsubscribeToken,
      });
      return existing._id;
    }

    const { ok } = await rateLimit(ctx, { name: "signupGlobal" });
    if (!ok) {
      throw new ConvexError(RATE_LIMIT_ERROR);
    }

    const unsubscribeToken = await issueUnsubscribeToken(ctx);
    const userId = await ctx.db.insert("users", {
      ...args,
      email: normalizedEmail,
      active: false,
      unsubscribeToken,
      createdAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.emails.sendWelcomeEmail, {
      name: args.name,
      email: normalizedEmail,
      locationName: args.locationName,
      unsubscribeToken,
    });
    return userId;
  },
});

export const backfillMissingUnsubscribeTokens = internalMutation({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect();
    let updatedCount = 0;

    for (const user of users) {
      if (user.unsubscribeToken) {
        continue;
      }

      await ctx.db.patch(user._id, {
        unsubscribeToken: await issueUnsubscribeToken(ctx),
      });
      updatedCount += 1;
    }

    return { updatedCount };
  },
});

export const unsubscribeByToken = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const token = args.token.trim();
    if (!token) {
      throw new ConvexError(INVALID_UNSUBSCRIBE_TOKEN_ERROR);
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_unsubscribeToken", (q) =>
        q.eq("unsubscribeToken", token)
      )
      .unique();

    if (!user) {
      throw new ConvexError(INVALID_UNSUBSCRIBE_TOKEN_ERROR);
    }

    if (user.active) {
      await ctx.db.patch(user._id, { active: false, unsubscribeToken: undefined });
    }

    return { success: true };
  },
});

export const confirmByToken = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const token = args.token.trim();
    if (!token) {
      throw new ConvexError("Invalid confirmation link.");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_unsubscribeToken", (q) =>
        q.eq("unsubscribeToken", token)
      )
      .unique();

    if (!user) {
      throw new ConvexError("Invalid confirmation link.");
    }

    if (!user.active) {
      await ctx.db.patch(user._id, { active: true });
    }

    return { success: true };
  },
});

export const getUserLocationByToken = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const token = args.token.trim();
    if (!token) {
      throw new ConvexError("Invalid change-location link.");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_unsubscribeToken", (q) =>
        q.eq("unsubscribeToken", token)
      )
      .unique();

    if (!user || !user.active) {
      throw new ConvexError("Invalid change-location link.");
    }

    return { locationName: user.locationName };
  },
});

export const updateLocationByToken = mutation({
  args: {
    token: v.string(),
    latitude: v.number(),
    longitude: v.number(),
    locationName: v.string(),
    timezone: v.string(),
  },
  handler: async (ctx, args) => {
    const token = args.token.trim();
    if (!token) {
      throw new ConvexError("Invalid change-location link.");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_unsubscribeToken", (q) =>
        q.eq("unsubscribeToken", token)
      )
      .unique();

    if (!user || !user.active) {
      throw new ConvexError("Invalid change-location link.");
    }

    const { ok } = await rateLimit(ctx, { name: "updateLocationGlobal" });
    if (!ok) {
      throw new ConvexError("Too many location-update attempts. Please try again later.");
    }

    const { token: _token, ...location } = args;
    await ctx.db.patch(user._id, location);

    return { success: true };
  },
});
