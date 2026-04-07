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
  { hourUTC: 3, minuteUTC: 0 }, // 3am UTC ≈ 10pm EST / 11pm EDT
  internal.adminDigest.sendDailyDigest
);

export default crons;
