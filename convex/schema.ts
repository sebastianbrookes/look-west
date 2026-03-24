import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
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
    status: v.string(),
    errorMessage: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_status", ["status"])
    .index("by_userId", ["userId"]),
});
