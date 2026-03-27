/**
 * Sunset time calculation and quality scoring.
 * Ported from scripts/alerts/sunset_check.py and scripts/alerts/fallback_scorer.py
 */

import SunCalc from "suncalc";

// ---------------------------------------------------------------------------
// Sunset time
// ---------------------------------------------------------------------------

export function getSunsetTime(lat: number, lon: number, timezone: string): Date {
  // Get "today" in the user's local timezone
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(now);
  const year = Number(parts.find((p) => p.type === "year")!.value);
  const month = Number(parts.find((p) => p.type === "month")!.value);
  const day = Number(parts.find((p) => p.type === "day")!.value);

  // SunCalc.getTimes expects a Date for the day — use noon UTC of the local date
  const localDate = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  const times = SunCalc.getTimes(localDate, lat, lon);
  return times.sunset;
}

// ---------------------------------------------------------------------------
// SunsetHue scorer
// ---------------------------------------------------------------------------

export async function fetchSunsetHueScore(
  lat: number,
  lon: number,
  timezone: string,
  apiKey: string
): Promise<{ score: number; label: string }> {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: timezone });
  const today = formatter.format(now); // "YYYY-MM-DD"

  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    date: today,
    type: "sunset",
  });

  const resp = await fetch(`https://api.sunsethue.com/event?${params}`, {
    headers: { "x-api-key": apiKey },
  });
  if (!resp.ok) {
    throw new Error(`SunsetHue API error: ${resp.status} ${await resp.text()}`);
  }

  const data = await resp.json();
  const eventData = data?.data;
  if (!eventData) {
    throw new Error("No quality data returned from SunsetHue");
  }

  return {
    score: Math.round((eventData.quality ?? 0) * 100),
    label: eventData.quality_text ?? "Poor",
  };
}

// ---------------------------------------------------------------------------
// OpenWeatherMap fallback scorer
// ---------------------------------------------------------------------------

function cloudScore(pct: number): number {
  if (pct <= 10) return 30;
  if (pct <= 30) return 30 + (pct - 10) * 3;
  if (pct <= 70) return 90 + (Math.min(pct, 50) - 30) * 0.5;
  if (pct <= 85) return 90 - (pct - 70) * 4;
  return Math.max(10, 30 - (pct - 85));
}

function humidityScore(pct: number): number {
  if (pct >= 40 && pct <= 70) return 90;
  if (pct < 40) return Math.max(30, 90 - (40 - pct) * 1.5);
  return Math.max(10, 90 - (pct - 70) * 2.5);
}

function visibilityScore(meters: number): number {
  return Math.min(100, (meters / 10000) * 100);
}

function aqiScore(aqi: number): number {
  const scores: Record<number, number> = { 1: 60, 2: 90, 3: 70, 4: 30, 5: 10 };
  return scores[aqi] ?? 50;
}

export async function fetchOwmScore(
  lat: number,
  lon: number,
  apiKey: string
): Promise<{ score: number; label: string }> {
  // Current weather
  const weatherParams = new URLSearchParams({
    lat: String(lat),
    lon: String(lon),
    appid: apiKey,
  });
  const weatherResp = await fetch(
    `https://api.openweathermap.org/data/2.5/weather?${weatherParams}`
  );
  if (!weatherResp.ok) {
    throw new Error(`OWM weather error: ${weatherResp.status}`);
  }
  const weather = await weatherResp.json();

  const clouds = weather.clouds?.all ?? 50;
  const humidity = weather.main?.humidity ?? 50;
  const visibility = weather.visibility ?? 10000;

  // Air quality (optional)
  let aqi: number | null = null;
  try {
    const aqiResp = await fetch(
      `https://api.openweathermap.org/data/2.5/air_pollution?${weatherParams}`
    );
    if (aqiResp.ok) {
      const aqiData = await aqiResp.json();
      aqi = aqiData.list?.[0]?.main?.aqi ?? null;
    }
  } catch {
    // Non-blocking
  }

  // Weighted composite
  const c = cloudScore(clouds);
  const h = humidityScore(humidity);
  const v = visibilityScore(visibility);

  let total: number;
  if (aqi !== null) {
    const a = aqiScore(aqi);
    total = c * 0.4 + h * 0.25 + v * 0.2 + a * 0.15;
  } else {
    total = c * 0.47 + h * 0.29 + v * 0.24;
  }

  const score = Math.round(Math.min(100, Math.max(0, total)));
  return { score, label: getQualityLabel(score) };
}

// ---------------------------------------------------------------------------
// Current weather (for message generation context)
// ---------------------------------------------------------------------------

export async function fetchCurrentWeather(
  lat: number,
  lon: number,
  apiKey: string
): Promise<{ tempF: number; description: string; cloudCover: number }> {
  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lon),
    appid: apiKey,
    units: "imperial",
  });
  const resp = await fetch(
    `https://api.openweathermap.org/data/2.5/weather?${params}`
  );
  if (!resp.ok) {
    throw new Error(`OWM weather error: ${resp.status}`);
  }
  const data = await resp.json();
  return {
    tempF: Math.round(data.main.temp),
    description: data.weather[0].description,
    cloudCover: data.clouds?.all ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Quality label
// ---------------------------------------------------------------------------

export function getQualityLabel(score: number): string {
  if (score <= 25) return "Poor";
  if (score <= 50) return "Fair";
  if (score <= 75) return "Good";
  return "Great";
}
