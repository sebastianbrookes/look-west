import { defineRateLimits } from "convex-helpers/server/rateLimit";

export const { checkRateLimit, rateLimit, resetRateLimit } = defineRateLimits({
  // Global limit: max 50 signup emails per hour across all users
  signupGlobal: {
    kind: "token bucket",
    rate: 50,
    period: 60 * 60 * 1000, // 1 hour
    capacity: 50,
  },
});
