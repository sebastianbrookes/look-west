"use node";

import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  getSunsetTime,
  fetchSunsetHueScore,
  fetchOwmScore,
  fetchCurrentWeather,
} from "./sunsetScoring";
import { SYSTEM_PROMPT, buildUserPrompt } from "./prompts";
import { buildAlertHtml, sendAlertEmail } from "./alertEmails";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const SUNSET_QUALITY_THRESHOLD = Number(
  process.env.SUNSET_QUALITY_THRESHOLD ?? "40"
);
const SUNSET_SCORER = process.env.SUNSET_SCORER ?? "sunsethue";
const APP_BASE_URL = (
  process.env.APP_BASE_URL ?? "https://golookwest.com"
).replace(/\/+$/, "");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function retry<T>(
  fn: () => Promise<T>,
  retries = 1,
  delayMs = 2000,
  label = "API call"
): Promise<T> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (attempt < retries) {
        console.warn(
          `${label} failed (attempt ${attempt + 1}), retrying in ${delayMs}ms: ${e}`
        );
        await new Promise((r) => setTimeout(r, delayMs));
      } else {
        throw e;
      }
    }
  }
  throw new Error("Unreachable");
}

function formatSunsetLocal(sunset: Date, timezone: string): string {
  return sunset.toLocaleTimeString("en-US", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function computeViewingTime(sunsetTimeLocal: string): string {
  // Parse "7:42 PM" style, subtract 30 minutes
  const match = sunsetTimeLocal.match(
    /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i
  );
  if (!match) return sunsetTimeLocal;

  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const ampm = match[3].toUpperCase();

  // Convert to 24h
  if (ampm === "PM" && hours !== 12) hours += 12;
  if (ampm === "AM" && hours === 12) hours = 0;

  // Subtract 30 minutes
  let totalMinutes = hours * 60 + minutes - 30;
  if (totalMinutes < 0) totalMinutes += 24 * 60;

  const viewH = Math.floor(totalMinutes / 60);
  const viewM = totalMinutes % 60;
  const viewAmPm = viewH >= 12 ? "PM" : "AM";
  const displayH = viewH % 12 || 12;

  return `${displayH}:${String(viewM).padStart(2, "0")} ${viewAmPm}`;
}

async function generateMessage(args: {
  qualityScore: number;
  locationName: string;
  sunsetTimeLocal: string;
  tempF: string | number;
  weatherDescription: string;
  cloudCover: number;
}): Promise<{ message: string; subject: string }> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("Missing OPENROUTER_API_KEY env var");

  const viewingTime = computeViewingTime(args.sunsetTimeLocal);

  const userPrompt = buildUserPrompt({
    location: args.locationName,
    sunsetTime: args.sunsetTimeLocal,
    viewingTime,
    weatherDescription: args.weatherDescription,
    temperature: args.tempF,
    cloudCover: args.cloudCover,
    qualityScore: args.qualityScore,
  });

  const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENROUTER_MODEL ?? "moonshotai/kimi-k2-0905",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 1000,
    }),
  });

  if (!resp.ok) {
    throw new Error(`OpenRouter error: ${resp.status} ${await resp.text()}`);
  }

  const data = await resp.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error(
      `OpenRouter returned no content: ${JSON.stringify(data).slice(0, 500)}`
    );
  }
  const raw: string = content.trim();

  // Parse subject line
  let message = raw;
  let subject = `Sunset alert for ${args.locationName}`;
  for (const line of raw.split("\n")) {
    if (line.trim().toUpperCase().startsWith("SUBJECT:")) {
      subject = line.trim().split(":").slice(1).join(":").trim().slice(0, 40);
      subject = subject.replace(/\u2014/g, "-").replace(/\u2013/g, "-");
      message = raw.replace(line, "").trim();
      break;
    }
  }

  return { message, subject };
}

// ---------------------------------------------------------------------------
// Phase 1 — Score Check & Queue
// ---------------------------------------------------------------------------

export const sunsetScoreCheck = internalAction({
  args: {},
  handler: async (ctx) => {
    await ctx.runMutation(internal.users.backfillMissingUnsubscribeTokens);

    const users = await ctx.runQuery(
      internal.users.getActiveUsersForDelivery
    );
    if (!users.length) {
      console.log("No active users found.");
      return;
    }
    console.log(`Found ${users.length} active user(s).`);

    const now = new Date();
    const scoreCache = new Map<string, { score: number; label: string }>();

    for (const user of users) {
      const location = user.locationName ?? "Unknown";
      try {
        const sunset = getSunsetTime(
          user.latitude,
          user.longitude,
          user.timezone
        );
        const minutesUntil =
          (sunset.getTime() - now.getTime()) / (1000 * 60);

        // Timing filter: 60-75 minutes before sunset
        if (minutesUntil < 60 || minutesUntil > 75) {
          console.log(
            `[${location}] Sunset in ${Math.round(minutesUntil)}m — outside window, skipping`
          );
          continue;
        }
        console.log(
          `[${location}] Sunset in ${Math.round(minutesUntil)}m — within window`
        );

        // Idempotency check
        const existing = await ctx.runQuery(
          internal.alerts.getTodaysAlertForUser,
          { userId: user._id, timezone: user.timezone }
        );
        if (existing) {
          console.log(
            `[${location}] Alert already exists for today, skipping`
          );
          continue;
        }

        // Quality score with geo-cache
        const cacheKey = `${user.latitude.toFixed(2)},${user.longitude.toFixed(2)}`;
        let quality = scoreCache.get(cacheKey);

        if (!quality) {
          const sunsethueKey = process.env.SUNSETHUE_API_KEY ?? "";
          const owmKey = process.env.OPENWEATHERMAP_API_KEY ?? "";

          if (SUNSET_SCORER === "openweathermap") {
            quality = await retry(
              () => fetchOwmScore(user.latitude, user.longitude, owmKey),
              1,
              2000,
              "OpenWeatherMap"
            );
          } else {
            try {
              quality = await retry(
                () =>
                  fetchSunsetHueScore(
                    user.latitude,
                    user.longitude,
                    user.timezone,
                    sunsethueKey
                  ),
                1,
                2000,
                "SunsetHue"
              );
            } catch (e) {
              console.warn(
                `SunsetHue unavailable (${e}), falling back to OpenWeatherMap`
              );
              quality = await retry(
                () => fetchOwmScore(user.latitude, user.longitude, owmKey),
                1,
                2000,
                "OpenWeatherMap"
              );
            }
          }
          scoreCache.set(cacheKey, quality);
        }

        const { score, label } = quality;
        console.log(`[${location}] Quality: ${score}% (${label})`);

        const sunsetIso = sunset.toISOString();
        const sendTime = new Date(
          sunset.getTime() - 60 * 60 * 1000
        ).toISOString();

        if (score >= SUNSET_QUALITY_THRESHOLD) {
          const sunsetLocal = formatSunsetLocal(sunset, user.timezone);

          // Fetch current weather
          let tempF: string | number = "N/A";
          let weatherDesc = "unknown";
          let cloudCover = 0;
          try {
            const owmKey = process.env.OPENWEATHERMAP_API_KEY ?? "";
            const weather = await fetchCurrentWeather(
              user.latitude,
              user.longitude,
              owmKey
            );
            tempF = weather.tempF;
            weatherDesc = weather.description;
            cloudCover = weather.cloudCover;
            console.log(
              `[${location}] Weather: ${tempF}\u00B0F, ${weatherDesc}, ${cloudCover}% clouds`
            );
          } catch (e) {
            console.warn(
              `[${location}] Failed to fetch weather: ${e}, using defaults`
            );
          }

          // Generate message
          const result = await retry(
            () =>
              generateMessage({
                qualityScore: score,
                locationName: location,
                sunsetTimeLocal: sunsetLocal,
                tempF,
                weatherDescription: weatherDesc,
                cloudCover,
              }),
            1,
            2000,
            "OpenRouter"
          );

          console.log(`[${location}] Subject: ${result.subject}`);
          console.log(`[${location}] Message: ${result.message}`);

          await ctx.runMutation(internal.alerts.logAlert, {
            userId: user._id,
            sunsetTime: sunsetIso,
            scheduledSendTime: sendTime,
            qualityScore: score,
            qualityLabel: label,
            messageSent: result.message,
            subjectLine: result.subject,
            status: "pending",
          });
          console.log(`[${location}] Queued pending alert`);
        } else {
          // Below threshold — log as skipped
          await ctx.runMutation(internal.alerts.logAlert, {
            userId: user._id,
            sunsetTime: sunsetIso,
            scheduledSendTime: sendTime,
            qualityScore: score,
            qualityLabel: label,
            messageSent: "",
            status: "skipped",
          });
          console.log(
            `[${location}] Below threshold (${score} < ${SUNSET_QUALITY_THRESHOLD}), skipped`
          );
        }
      } catch (e) {
        console.error(`[${location}] Error during check: ${e}`);
        continue;
      }
    }
  },
});

// ---------------------------------------------------------------------------
// Phase 2 — Send Pending Alerts
// ---------------------------------------------------------------------------

export const sendPendingAlerts = internalAction({
  args: {},
  handler: async (ctx) => {
    await ctx.runMutation(internal.users.backfillMissingUnsubscribeTokens);
    await ctx.runMutation(internal.alerts.expireStalePendingAlerts);

    const alerts = await ctx.runQuery(internal.alerts.getPendingAlerts);
    if (!alerts.length) {
      console.log("No pending alerts to send.");
      return;
    }
    console.log(`Found ${alerts.length} pending alert(s).`);

    const users = await ctx.runQuery(
      internal.users.getActiveUsersForDelivery
    );
    const userMap = new Map(users.map((u) => [u._id, u]));

    for (const alert of alerts) {
      const user = userMap.get(alert.userId);
      const location = user?.locationName ?? "Unknown";

      if (!user) {
        console.error(
          `[${location}] User ${alert.userId} not found or inactive`
        );
        await ctx.runMutation(internal.alerts.updateAlertStatus, {
          alertId: alert._id,
          status: "error",
          errorMessage: "User not found or inactive",
        });
        continue;
      }

      try {
        // Format sunset time in user's timezone
        let sunsetLocal = "";
        try {
          const sunsetDt = new Date(alert.sunsetTime);
          sunsetLocal = formatSunsetLocal(sunsetDt, user.timezone);
        } catch {
          // Leave empty on parse failure
        }

        const unsubscribeUrl = `${APP_BASE_URL}/unsubscribe?token=${encodeURIComponent(user.unsubscribeToken)}`;
        const changeLocationUrl = `${APP_BASE_URL}/change-location?token=${encodeURIComponent(user.unsubscribeToken)}`;
        const html = buildAlertHtml({
          message: alert.messageSent,
          location,
          sunsetTime: sunsetLocal,
          unsubscribeUrl,
          changeLocationUrl,
        });

        const subject =
          alert.subjectLine || `Sunset alert for ${location}`;

        await retry(
          () =>
            sendAlertEmail({
              to: user.email,
              subject,
              html,
              plainText: `${alert.messageSent}\n\nChange location: ${changeLocationUrl}`,
              unsubscribeUrl,
            }),
          1,
          2000,
          `Resend [${location}]`
        );

        await ctx.runMutation(internal.alerts.updateAlertStatus, {
          alertId: alert._id,
          status: "sent",
        });
        console.log(`[${location}] Email sent to ${user.email}`);
      } catch (e) {
        console.error(`[${location}] Failed to send email: ${e}`);
        await ctx.runMutation(internal.alerts.updateAlertStatus, {
          alertId: alert._id,
          status: "error",
          errorMessage: String(e),
        });
      }
    }
  },
});
