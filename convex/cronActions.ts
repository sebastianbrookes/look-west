"use node";

import { internalAction } from "./_generated/server";

export const sunsetScoreCheck = internalAction({
  args: {},
  handler: async () => {
    console.log("Score check triggered");
  },
});

export const sendPendingAlerts = internalAction({
  args: {},
  handler: async () => {
    console.log("Send pending triggered");
  },
});
