import {
  internalQuery,
  mutation,
  query,
  type MutationCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
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

type UserWithMaybeToken = Doc<"users">;

function withoutUnsubscribeToken(user: UserWithMaybeToken) {
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
        const updates: Partial<Doc<"users">> = {
          name: args.name,
          email: normalizedEmail,
          latitude: args.latitude,
          longitude: args.longitude,
          locationName: args.locationName,
          timezone: args.timezone,
        };

        if (!existing.unsubscribeToken) {
          updates.unsubscribeToken = await issueUnsubscribeToken(ctx);
        }

        if (!hasLocationChanged(existing, args)) {
          if (updates.unsubscribeToken) {
            await ctx.db.patch(existing._id, updates);
          }
          throw new Error(DUPLICATE_ACTIVE_EMAIL_ERROR);
        }

        await ctx.db.patch(existing._id, updates);
        return existing._id;
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

export const backfillMissingUnsubscribeTokens = mutation({
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
      throw new Error("Invalid confirmation link.");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_unsubscribeToken", (q) =>
        q.eq("unsubscribeToken", token)
      )
      .unique();

    if (!user) {
      throw new Error("Invalid confirmation link.");
    }

    if (!user.active) {
      await ctx.db.patch(user._id, { active: true });
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
