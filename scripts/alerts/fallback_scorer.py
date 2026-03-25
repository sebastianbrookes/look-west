"""OpenWeatherMap fallback sunset quality scorer.

Estimates sunset quality from weather conditions using a weighted heuristic:
  - Cloud cover  40%  (best at 30-70%)
  - Humidity     25%  (best at 40-70%)
  - Visibility   20%  (higher is better)
  - AQI          15%  (moderate can enhance colors)
"""

import requests


def _cloud_score(pct):
    """Best sunsets need partial clouds (30-70%) to catch light."""
    if pct <= 10:
        return 30
    if pct <= 30:
        return 30 + (pct - 10) * 3          # 30 → 90
    if pct <= 70:
        return 90 + (min(pct, 50) - 30) * 0.5  # ~90-100
    if pct <= 85:
        return 90 - (pct - 70) * 4           # 90 → 30
    return max(10, 30 - (pct - 85))


def _humidity_score(pct):
    """Moderate humidity (40-70%) gives the richest colors."""
    if 40 <= pct <= 70:
        return 90
    if pct < 40:
        return max(30, 90 - (40 - pct) * 1.5)
    return max(10, 90 - (pct - 70) * 2.5)


def _visibility_score(meters):
    """Higher visibility = cleaner light path. Max from OWM is 10 000 m."""
    return min(100, (meters / 10000) * 100)


def _aqi_score(aqi):
    """OWM AQI 1-5. Slight haze (2-3) can actually boost sunset color."""
    return {1: 60, 2: 90, 3: 70, 4: 30, 5: 10}.get(aqi, 50)


def calculate_owm_score(lat, lon, api_key):
    """Return {"score": 0-100, "label": str} using OpenWeatherMap data."""
    # Current weather
    weather_resp = requests.get(
        "https://api.openweathermap.org/data/2.5/weather",
        params={"lat": lat, "lon": lon, "appid": api_key},
        timeout=10,
    )
    weather_resp.raise_for_status()
    weather = weather_resp.json()

    clouds = weather.get("clouds", {}).get("all", 50)
    humidity = weather.get("main", {}).get("humidity", 50)
    visibility = weather.get("visibility", 10000)

    # Air quality (optional — don't fail if unavailable)
    aqi = None
    try:
        aqi_resp = requests.get(
            "https://api.openweathermap.org/data/2.5/air_pollution",
            params={"lat": lat, "lon": lon, "appid": api_key},
            timeout=10,
        )
        aqi_resp.raise_for_status()
        aqi = aqi_resp.json()["list"][0]["main"]["aqi"]
    except Exception:
        pass

    # Weighted composite
    c = _cloud_score(clouds)
    h = _humidity_score(humidity)
    v = _visibility_score(visibility)

    if aqi is not None:
        a = _aqi_score(aqi)
        total = c * 0.40 + h * 0.25 + v * 0.20 + a * 0.15
    else:
        # Redistribute AQI weight proportionally
        total = c * 0.47 + h * 0.29 + v * 0.24

    score = round(min(100, max(0, total)))

    if score <= 25:
        label = "Poor"
    elif score <= 50:
        label = "Fair"
    elif score <= 75:
        label = "Good"
    else:
        label = "Great"

    return {"score": score, "label": label}
