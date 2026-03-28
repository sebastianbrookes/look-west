import { defineRateLimits } from "convex-helpers/server/rateLimit";

export const { checkRateLimit, rateLimit, resetRateLimit } = defineRateLimits({
  // Global limit: max N signup emails per hour across all users
  signupGlobal: {
    kind: "token bucket",
    rate: Number(process.env.SIGNUP_RATE_LIMIT ?? 50),
    period: 60 * 60 * 1000, // 1 hour
    capacity: Number(process.env.SIGNUP_RATE_LIMIT ?? 50),
  },
  updateLocationGlobal: {
    kind: "token bucket",
    rate: 10,
    period: 60 * 60 * 1000, // 1 hour
    capacity: 10,
  },
});
