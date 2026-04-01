import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "sunsetScoreCheck",
  { minutes: 15 },
  internal.cronActions.sunsetScoreCheck
);

crons.interval(
  "sendPendingAlerts",
  { minutes: 5 },
  internal.cronActions.sendPendingAlerts
);

crons.daily(
  "adminDailyDigest",
  { hourUTC: 0, minuteUTC: 0 }, // midnight UTC ≈ 7pm EST / 8pm EDT
  internal.adminDigest.sendDailyDigest
);

export default crons;
