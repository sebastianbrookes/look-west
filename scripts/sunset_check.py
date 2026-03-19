#!/usr/bin/env python3
"""Look West — sunset alert checker and sender."""

import argparse
import logging
import os
import sys
import time
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import requests
import resend
from astral import LocationInfo
from astral.sun import sun
from convex import ConvexClient
from dotenv import load_dotenv

from fallback_scorer import calculate_owm_score

# Load .env from project root
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

# Logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger("sunset_check")

# Environment
CONVEX_URL = os.getenv("CONVEX_URL")
SUNSETWX_API_KEY = os.getenv("SUNSETWX_API_KEY", "")
OPENWEATHERMAP_API_KEY = os.getenv("OPENWEATHERMAP_API_KEY", "")
RESEND_API_KEY = os.getenv("RESEND_API_KEY", "")
RESEND_FROM_EMAIL = os.getenv("RESEND_FROM_EMAIL", "")
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")
SUNSET_QUALITY_THRESHOLD = int(os.getenv("SUNSET_QUALITY_THRESHOLD", "50"))
SUNSET_SCORER = os.getenv("SUNSET_SCORER", "sunsetwx")


def get_convex_client():
    """Connect to Convex, exit on failure."""
    if not CONVEX_URL:
        logger.error("CONVEX_URL is not set. Run `npx convex dev` and copy the deployment URL.")
        sys.exit(1)
    try:
        return ConvexClient(CONVEX_URL)
    except Exception as e:
        logger.error(f"Failed to connect to Convex: {e}")
        sys.exit(1)


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

def get_sunsetwx_score(lat, lon, cache):
    """Fetch sunset quality from SunsetWx API with geo-caching."""
    cache_key = (round(lat, 2), round(lon, 2))
    if cache_key in cache:
        return cache[cache_key]

    def _fetch():
        resp = requests.get(
            "https://sunburst.sunsetwx.com/v1/quality",
            params={"geo": f"{lat},{lon}", "type": "sunset"},
            headers={"Authorization": f"Bearer {SUNSETWX_API_KEY}"},
            timeout=10,
        )
        resp.raise_for_status()
        return resp.json()

    data = retry(_fetch, retries=1, delay=2.0, label="SunsetWx")

    features = data.get("features", [])
    if not features:
        raise ValueError("No quality data returned from SunsetWx")

    props = features[0].get("properties", {})
    result = {
        "score": props.get("quality_percent", 0),
        "label": props.get("quality", "Poor"),
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


def get_quality(lat, lon, cache):
    """Get sunset quality using the configured scorer, with automatic fallback."""
    if SUNSET_SCORER == "openweathermap":
        return get_owm_score(lat, lon, cache)
    try:
        return get_sunsetwx_score(lat, lon, cache)
    except Exception as e:
        logger.warning(f"SunsetWx unavailable ({e}), falling back to OpenWeatherMap")
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
    return {"temp_f": temp_f, "description": description}


# ---------------------------------------------------------------------------
# Message generation
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = (
    'You write sunset alerts for an email service called "Look West." '
    "Each message should feel like it's from a friend, not a brand."
)

USER_PROMPT_TEMPLATE = """Write a short email body (under 320 characters) motivating someone to go watch tonight's sunset.

Tonight's conditions:
- Current temperature: {temp_f}°F ({weather_description})
- Quality: {quality_percent}% ({quality_label})
- Location: {location_name}
- Sunset at: {sunset_time_local}

Style rules:
- Reference the specific conditions
- Weave the current weather into the message naturally (e.g. if cold, suggest grabbing a coat; if warm, suggest sitting outside)
- Include the temperature in the message
- Don't mention the location - it's already indicated in the email subject.
- Don't use the phrase "Look West"
- No hashtags. No emojis. Max one exclamation mark.
- Don't use the phrase "putting on a show" or anything similar
- Avoid flowery adjectives and 'inspirational' language. Do not try to sell the sunset; just report it. Use plain, direct vocabulary.
- When mentioning the quality, treat it as a score (e.g. "the sunset this evening has a 92% quality score")
- Under 350 characters, no exceptions

Information ordering:
- First mention the sunset score ({quality_percent}) and when the sun will be gone ({sunset_time_local})
- Then the current weather conditions (temp and description)"""


def generate_message(quality_percent, quality_label, location_name, sunset_time_local, temp_f, weather_description):
    """Generate an email message using GPT 5.4 Mini via OpenRouter."""
    user_prompt = USER_PROMPT_TEMPLATE.format(
        quality_percent=quality_percent,
        quality_label=quality_label,
        location_name=location_name,
        sunset_time_local=sunset_time_local,
        temp_f=temp_f,
        weather_description=weather_description,
    )

    resp = requests.post(
        "https://openrouter.ai/api/v1/chat/completions",
        headers={
            "Authorization": f"Bearer {OPENROUTER_API_KEY}",
            "Content-Type": "application/json",
        },
        json={
            "model": "google/gemini-3-flash-preview",
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

    users = client.query("users:getActiveUsers")
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
            elif not (50 <= minutes_until <= 65):
                logger.info(f"[{location}] Sunset in {minutes_until:.0f}m — outside window, skipping")
                continue
            else:
                logger.info(f"[{location}] Sunset in {minutes_until:.0f}m — within window")

            # Idempotency check
            existing = client.query("alerts:getTodaysAlertForUser", {"userId": user["_id"]})
            if existing:
                logger.info(f"[{location}] Alert already exists for today, skipping")
                continue

            # Quality score
            quality = get_quality(user["latitude"], user["longitude"], score_cache)
            score = quality["score"]
            label = quality["label"]
            logger.info(f"[{location}] Quality: {score}% ({label})")

            sunset_iso = sunset.isoformat()
            send_time = now.isoformat() if test_email else (sunset - timedelta(minutes=25)).isoformat()

            if score >= SUNSET_QUALITY_THRESHOLD:
                sunset_local = sunset.strftime("%-I:%M %p")

                # Fetch current weather for the message
                try:
                    weather = get_current_weather(user["latitude"], user["longitude"])
                    temp_f = weather["temp_f"]
                    weather_desc = weather["description"]
                    logger.info(f"[{location}] Weather: {temp_f}°F, {weather_desc}")
                except Exception as e:
                    logger.warning(f"[{location}] Failed to fetch weather: {e}, using defaults")
                    temp_f = "N/A"
                    weather_desc = "unknown"

                message = generate_message(score, label, location, sunset_local, temp_f, weather_desc)
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

    alerts = client.query("alerts:getPendingAlerts")
    if not alerts:
        logger.info("No pending alerts to send.")
        return

    logger.info(f"Found {len(alerts)} pending alert(s).")

    # Build user lookup from active users
    users = client.query("users:getActiveUsers")
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
            def _send_email(body=alert["messageSent"], to=user["email"], loc=location):
                return resend.Emails.send({
                    "from": RESEND_FROM_EMAIL,
                    "to": [to],
                    "subject": f"Beautiful sunset alert in {loc} 🌅",
                    "text": body,
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
