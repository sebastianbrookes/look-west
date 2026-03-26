import { defineRateLimits } from "convex-helpers/server/rateLimit";

export const { checkRateLimit, rateLimit, resetRateLimit } = defineRateLimits({
  // Max 2 signup emails per email address per hour
  signupEmail: {
    kind: "token bucket",
    rate: 2,
    period: 60 * 60 * 1000, // 1 hour
    capacity: 2,
  },
});
