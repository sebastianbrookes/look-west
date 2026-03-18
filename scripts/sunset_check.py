#!/usr/bin/env python3
"""Go Look Up — sunset alert checker and sender."""

import argparse
import logging
import os
import sys
import time
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import requests
from astral import LocationInfo
from astral.sun import sun
from convex import ConvexClient
from dotenv import load_dotenv
from twilio.rest import Client as TwilioClient

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
TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID", "")
TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN", "")
TWILIO_FROM_NUMBER = os.getenv("TWILIO_FROM_NUMBER", "")
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
    """Get sunset quality using the configured scorer."""
    if SUNSET_SCORER == "openweathermap":
        return get_owm_score(lat, lon, cache)
    return get_sunsetwx_score(lat, lon, cache)


# ---------------------------------------------------------------------------
# Message generation
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = (
    'You write sunset alerts for a text message service called "Go Look Up." '
    "Each message should feel like it's from a friend, not a brand."
)

USER_PROMPT_TEMPLATE = """Write a single SMS (under 160 characters) motivating someone to go watch tonight's sunset.

Tonight's conditions:
- Quality: {quality_percent}% ({quality_label})
- Location: {location_name}
- Sunset at: {sunset_time_local}

Style rules:
- Warm, poetic, or playful — vary it every time
- Reference the specific conditions when you can
- No hashtags. No emojis. Max one exclamation mark.
- Under 160 characters, no exceptions"""


def generate_message(quality_percent, quality_label, location_name, sunset_time_local):
    """Generate an SMS message using Claude Haiku via OpenRouter."""
    user_prompt = USER_PROMPT_TEMPLATE.format(
        quality_percent=quality_percent,
        quality_label=quality_label,
        location_name=location_name,
        sunset_time_local=sunset_time_local,
    )

    resp = requests.post(
        "https://openrouter.ai/api/v1/chat/completions",
        headers={
            "Authorization": f"Bearer {OPENROUTER_API_KEY}",
            "Content-Type": "application/json",
        },
        json={
            "model": "anthropic/claude-haiku-4-5-20251001",
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            "max_tokens": 200,
        },
        timeout=15,
    )
    resp.raise_for_status()
    return resp.json()["choices"][0]["message"]["content"].strip()


# ---------------------------------------------------------------------------
# Phase 1 — Score Check & Queue
# ---------------------------------------------------------------------------

def phase_check(client, test_phone=None):
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
            if test_phone:
                if user["phone"] != test_phone:
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
            send_time = (sunset - timedelta(minutes=25)).isoformat()

            if score >= SUNSET_QUALITY_THRESHOLD:
                sunset_local = sunset.strftime("%-I:%M %p")
                message = generate_message(score, label, location, sunset_local)
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

    twilio_client = TwilioClient(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)

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
            def _send_sms(body=alert["messageSent"], to=user["phone"]):
                return twilio_client.messages.create(
                    body=body,
                    from_=TWILIO_FROM_NUMBER,
                    to=to,
                )

            retry(_send_sms, retries=1, delay=2.0, label=f"Twilio [{location}]")

            client.mutation("alerts:updateAlertStatus", {
                "alertId": alert["_id"],
                "status": "sent",
            })
            logger.info(f"[{location}] SMS sent to {user['phone']}")

        except Exception as e:
            logger.error(f"[{location}] Failed to send SMS: {e}")
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
        help="Phone number (E.164) to force-run for, bypassing sunset timing filter",
    )
    args = parser.parse_args()

    client = get_convex_client()

    if args.command in ("check", "run"):
        phase_check(client, test_phone=args.test_user)
    if args.command in ("send", "run"):
        phase_send(client)

    logger.info("Done.")


if __name__ == "__main__":
    main()
