import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { rateLimitTables } from "convex-helpers/server/rateLimit";

export default defineSchema({
  ...rateLimitTables,
  users: defineTable({
    name: v.string(),
    email: v.string(),
    latitude: v.number(),
    longitude: v.number(),
    locationName: v.string(),
    timezone: v.string(),
    active: v.boolean(),
    unsubscribeToken: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_unsubscribeToken", ["unsubscribeToken"]),

  alerts: defineTable({
    userId: v.id("users"),
    sunsetTime: v.string(),
    scheduledSendTime: v.string(),
    qualityScore: v.number(),
    qualityLabel: v.string(),
    messageSent: v.string(),
    subjectLine: v.optional(v.string()),
    status: v.string(),
    errorMessage: v.optional(v.string()),
    test: v.optional(v.boolean()),
    createdAt: v.number(),
  })
    .index("by_status", ["status"])
    .index("by_userId", ["userId"]),

  quotes: defineTable({
    text: v.string(),
    author: v.string(),
    source: v.optional(v.string()),
    year: v.optional(v.number()),
    hidden: v.optional(v.boolean()),
  }),
});
