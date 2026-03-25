#!/usr/bin/env python3
"""Look West — sunset alert checker and sender."""

import argparse
import logging
import sys
import os
import time
from urllib.parse import urlencode
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import requests
import resend
from astral import LocationInfo
from astral.sun import sun
from convex import ConvexClient
from dotenv import load_dotenv

from email_renderer import render_email_html
from fallback_scorer import calculate_owm_score
from prompts import SYSTEM_PROMPT, USER_PROMPT_TEMPLATE

# Load .env from project root
load_dotenv(os.path.join(os.path.dirname(__file__), "..", "..", ".env"))

# Logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger("sunset_check")

# Environment
CONVEX_URL = os.getenv("CONVEX_URL")
CONVEX_ADMIN_KEY = os.getenv("CONVEX_ADMIN_KEY", "")
SUNSETHUE_API_KEY = os.getenv("SUNSETHUE_API_KEY", "")
OPENWEATHERMAP_API_KEY = os.getenv("OPENWEATHERMAP_API_KEY", "")
RESEND_API_KEY = os.getenv("RESEND_API_KEY", "")
RESEND_FROM_EMAIL = os.getenv("RESEND_FROM_EMAIL", "")
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")
SUNSET_QUALITY_THRESHOLD = int(os.getenv("SUNSET_QUALITY_THRESHOLD", "40"))
SUNSET_SCORER = os.getenv("SUNSET_SCORER", "sunsethue")
APP_BASE_URL = os.getenv("APP_BASE_URL", "https://golookwest.com").rstrip("/")

def get_convex_client():
    """Connect to Convex, exit on failure."""
    if not CONVEX_URL:
        logger.error("CONVEX_URL is not set. Run `npx convex dev` and copy the deployment URL.")
        sys.exit(1)
    if not CONVEX_ADMIN_KEY:
        logger.error(
            "CONVEX_ADMIN_KEY is required for the sender because it calls internal Convex functions."
        )
        sys.exit(1)
    try:
        client = ConvexClient(CONVEX_URL)
        client.set_admin_auth(CONVEX_ADMIN_KEY)
        return client
    except Exception as e:
        logger.error(f"Failed to connect to Convex: {e}")
        sys.exit(1)


def build_unsubscribe_url(token: str) -> str:
    """Build the unsubscribe confirmation URL for a user token."""
    return f"{APP_BASE_URL}/unsubscribe?{urlencode({'token': token})}"


def retry(fn, retries=1, delay=2.0, label="API call"):
    """Call fn, retrying once on failure with a delay."""
    for attempt in range(retries + 1):
        try:
            return fn()
        except Exception as e:
            if attempt < retries:
                logger.warning(f"{label} failed (attempt {attempt + 1}), retrying in {delay}s: {e}")
                time.sleep(delay)
            else:
                raise


# ---------------------------------------------------------------------------
# Sunset time
# ---------------------------------------------------------------------------

def get_sunset_time(lat, lon, tz_name):
    """Calculate today's sunset time for a location using astral."""
    tz = ZoneInfo(tz_name)
    loc = LocationInfo(latitude=lat, longitude=lon)
    s = sun(loc.observer, date=datetime.now(tz).date(), tzinfo=tz)
    return s["sunset"]


# ---------------------------------------------------------------------------
# Sunset quality scorers
# ---------------------------------------------------------------------------

def get_sunsethue_score(lat, lon, cache, tz_name="UTC"):
    """Fetch sunset quality from SunsetHue API with geo-caching."""
    cache_key = (round(lat, 2), round(lon, 2))
    if cache_key in cache:
        return cache[cache_key]

    today = datetime.now(ZoneInfo(tz_name)).strftime("%Y-%m-%d")

    def _fetch():
        resp = requests.get(
            "https://api.sunsethue.com/event",
            params={
                "latitude": lat,
                "longitude": lon,
                "date": today,
                "type": "sunset",
            },
            headers={"x-api-key": SUNSETHUE_API_KEY},
            timeout=10,
        )
        resp.raise_for_status()
        return resp.json()

    data = retry(_fetch, retries=1, delay=2.0, label="SunsetHue")

    event_data = data.get("data")
    if not event_data:
        raise ValueError("No quality data returned from SunsetHue")

    result = {
        "score": round(event_data.get("quality", 0) * 100),
        "label": event_data.get("quality_text", "Poor"),
    }
    cache[cache_key] = result
    return result


def get_owm_score(lat, lon, cache):
    """Fetch sunset quality from OpenWeatherMap fallback with geo-caching."""
    cache_key = (round(lat, 2), round(lon, 2))
    if cache_key in cache:
        return cache[cache_key]

    result = retry(
        lambda: calculate_owm_score(lat, lon, OPENWEATHERMAP_API_KEY),
        retries=1,
        delay=2.0,
        label="OpenWeatherMap",
    )
    cache[cache_key] = result
    return result


def get_quality(lat, lon, cache, tz_name="UTC"):
    """Get sunset quality using the configured scorer, with automatic fallback."""
    if SUNSET_SCORER == "openweathermap":
        return get_owm_score(lat, lon, cache)
    try:
        return get_sunsethue_score(lat, lon, cache, tz_name=tz_name)
    except Exception as e:
        logger.warning(f"SunsetHue unavailable ({e}), falling back to OpenWeatherMap")
        return get_owm_score(lat, lon, cache)


def get_current_weather(lat, lon):
    """Fetch current temperature (°F) and description from OpenWeatherMap."""
    resp = requests.get(
        "https://api.openweathermap.org/data/2.5/weather",
        params={"lat": lat, "lon": lon, "appid": OPENWEATHERMAP_API_KEY, "units": "imperial"},
        timeout=10,
    )
    resp.raise_for_status()
    data = resp.json()
    temp_f = round(data["main"]["temp"])
    description = data["weather"][0]["description"]
    cloud_cover = data.get("clouds", {}).get("all", 0)
    return {"temp_f": temp_f, "description": description, "cloud_cover": cloud_cover}


# ---------------------------------------------------------------------------
# Message generation
# ---------------------------------------------------------------------------


def generate_message(quality_percent, quality_label, location_name, sunset_time_local, temp_f, weather_description, cloud_cover=0):
    """Generate an email message using Kimi K2 via OpenRouter."""
    sunset_dt = datetime.strptime(sunset_time_local, "%I:%M %p")
    viewing_time = (sunset_dt - timedelta(minutes=30)).strftime("%-I:%M %p")

    user_prompt = USER_PROMPT_TEMPLATE.format(
        location=location_name,
        sunset_time=sunset_time_local,
        viewing_time=viewing_time,
        weather_description=weather_description,
        temperature=temp_f,
        cloud_cover=cloud_cover,
        quality_score=quality_percent,
    )

    resp = requests.post(
        "https://openrouter.ai/api/v1/chat/completions",
        headers={
            "Authorization": f"Bearer {OPENROUTER_API_KEY}",
            "Content-Type": "application/json",
        },
        json={
            "model": "moonshotai/kimi-k2-0905",
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            "max_tokens": 1000,
        },
        timeout=15,
    )
    resp.raise_for_status()
    return resp.json()["choices"][0]["message"]["content"].strip()


# ---------------------------------------------------------------------------
# Phase 1 — Score Check & Queue
# ---------------------------------------------------------------------------

def phase_check(client, test_email=None):
    """Check sunset quality for active users and queue alerts."""
    logger.info("=== Phase 1: Score Check & Queue ===")

    client.mutation("users:backfillMissingUnsubscribeTokens")
    users = client.query("users:getActiveUsersForDelivery")
    if not users:
        logger.info("No active users found.")
        return

    logger.info(f"Found {len(users)} active user(s).")

    now = datetime.now(ZoneInfo("UTC"))
    score_cache = {}

    for user in users:
        location = user.get("locationName", "Unknown")
        try:
            sunset = get_sunset_time(user["latitude"], user["longitude"], user["timezone"])
            minutes_until = (sunset - now).total_seconds() / 60

            # Timing filter (bypassed in test mode)
            if test_email:
                if user["email"] != test_email:
                    continue
                logger.info(f"[{location}] Test mode — skipping timing filter (sunset in {minutes_until:.0f}m)")
            elif not (60 <= minutes_until <= 75):
                logger.info(f"[{location}] Sunset in {minutes_until:.0f}m — outside window, skipping")
                continue
            else:
                logger.info(f"[{location}] Sunset in {minutes_until:.0f}m — within window")

            # Idempotency check (bypassed in test mode)
            if not test_email:
                existing = client.query("alerts:getTodaysAlertForUser", {"userId": user["_id"]})
                if existing:
                    logger.info(f"[{location}] Alert already exists for today, skipping")
                    continue

            # Quality score
            quality = get_quality(user["latitude"], user["longitude"], score_cache, tz_name=user["timezone"])
            score = quality["score"]
            label = quality["label"]
            logger.info(f"[{location}] Quality: {score}% ({label})")

            sunset_iso = sunset.isoformat()
            send_time = now.isoformat() if test_email else (sunset - timedelta(minutes=60)).isoformat()

            if score >= SUNSET_QUALITY_THRESHOLD:
                sunset_local = sunset.strftime("%-I:%M %p")

                # Fetch current weather for the message
                try:
                    weather = get_current_weather(user["latitude"], user["longitude"])
                    temp_f = weather["temp_f"]
                    weather_desc = weather["description"]
                    cloud_cover = weather["cloud_cover"]
                    logger.info(f"[{location}] Weather: {temp_f}°F, {weather_desc}, {cloud_cover}% clouds")
                except Exception as e:
                    logger.warning(f"[{location}] Failed to fetch weather: {e}, using defaults")
                    temp_f = "N/A"
                    weather_desc = "unknown"
                    cloud_cover = 0

                message = generate_message(score, label, location, sunset_local, temp_f, weather_desc, cloud_cover)
                logger.info(f"[{location}] Message: {message}")

                client.mutation("alerts:logAlert", {
                    "userId": user["_id"],
                    "sunsetTime": sunset_iso,
                    "scheduledSendTime": send_time,
                    "qualityScore": score,
                    "qualityLabel": label,
                    "messageSent": message,
                    "status": "pending",
                })
                logger.info(f"[{location}] Queued pending alert")
            else:
                client.mutation("alerts:logAlert", {
                    "userId": user["_id"],
                    "sunsetTime": sunset_iso,
                    "scheduledSendTime": send_time,
                    "qualityScore": score,
                    "qualityLabel": label,
                    "messageSent": "",
                    "status": "skipped",
                })
                logger.info(f"[{location}] Below threshold ({score} < {SUNSET_QUALITY_THRESHOLD}), skipped")

        except Exception as e:
            logger.error(f"[{location}] Error during check: {e}")
            continue


# ---------------------------------------------------------------------------
# Phase 2 — Send Pending Messages
# ---------------------------------------------------------------------------

def phase_send(client):
    """Send all pending alerts whose scheduledSendTime has passed."""
    logger.info("=== Phase 2: Send Pending Alerts ===")

    client.mutation("users:backfillMissingUnsubscribeTokens")
    alerts = client.query("alerts:getPendingAlerts")
    if not alerts:
        logger.info("No pending alerts to send.")
        return

    logger.info(f"Found {len(alerts)} pending alert(s).")

    # Build user lookup from active users
    users = client.query("users:getActiveUsersForDelivery")
    user_map = {u["_id"]: u for u in users}

    resend.api_key = RESEND_API_KEY

    for alert in alerts:
        user = user_map.get(alert["userId"])
        location = user.get("locationName", "Unknown") if user else "Unknown"

        if not user:
            logger.error(f"[{location}] User {alert['userId']} not found or inactive")
            client.mutation("alerts:updateAlertStatus", {
                "alertId": alert["_id"],
                "status": "error",
                "errorMessage": "User not found or inactive",
            })
            continue

        try:
            # Parse sunset time from ISO string for display
            try:
                sunset_dt = datetime.fromisoformat(alert["sunsetTime"])
                user_tz = ZoneInfo(user.get("timezone", "UTC"))
                sunset_local = sunset_dt.astimezone(user_tz).strftime("%-I:%M %p")
            except Exception:
                sunset_local = ""

            unsubscribe_url = build_unsubscribe_url(user["unsubscribeToken"])
            html_body = render_email_html(
                message=alert["messageSent"],
                location=location,
                sunset_time=sunset_local,
                unsubscribe_url=unsubscribe_url,
            )

            def _send_email(body=alert["messageSent"], html=html_body, to=user["email"], loc=location, unsub=unsubscribe_url):
                return resend.Emails.send({
                    "from": RESEND_FROM_EMAIL,
                    "to": [to],
                    "subject": f"Beautiful sunset alert in {loc} 🌅",
                    "text": body,
                    "html": html,
                    "headers": {
                        "List-Unsubscribe": f"<{unsub}>",
                        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
                    },
                })

            retry(_send_email, retries=1, delay=2.0, label=f"Resend [{location}]")

            client.mutation("alerts:updateAlertStatus", {
                "alertId": alert["_id"],
                "status": "sent",
            })
            logger.info(f"[{location}] Email sent to {user['email']}")

        except Exception as e:
            logger.error(f"[{location}] Failed to send email: {e}")
            client.mutation("alerts:updateAlertStatus", {
                "alertId": alert["_id"],
                "status": "error",
                "errorMessage": str(e),
            })


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Go Look Up — sunset alert service")
    parser.add_argument(
        "command",
        nargs="?",
        default="run",
        choices=["check", "send", "run"],
        help="check = Phase 1 only, send = Phase 2 only, run = both (default: run)",
    )
    parser.add_argument(
        "--test-user",
        type=str,
        default=None,
        help="Email address to force-run for, bypassing sunset timing filter",
    )
    args = parser.parse_args()

    client = get_convex_client()

    if args.command in ("check", "run"):
        phase_check(client, test_email=args.test_user)
    if args.command in ("send", "run") or args.test_user:
        phase_send(client)

    logger.info("Done.")


if __name__ == "__main__":
    main()
