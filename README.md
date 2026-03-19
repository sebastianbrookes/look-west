# Look West

A sunset alert service that texts you a motivating message to go watch the sunset — but only when it's predicted to be beautiful.

## Setup

### 1. Convex backend

```bash
npm install
npx convex dev
```

`npx convex dev` will prompt you to create a Convex project on first run, generate the `convex/_generated/` types, deploy your schema, and start watching for changes.

Copy the deployment URL it prints (e.g. `https://your-deployment.convex.cloud`) into your `.env` file as `CONVEX_URL`.

### 2. Python script

```bash
pip install -r requirements.txt
cp .env.example .env   # then fill in your API keys
```

## Usage

```bash
# Phase 1 only — check sunset quality, queue alerts
python scripts/sunset_check.py check

# Phase 2 only — send queued SMS messages
python scripts/sunset_check.py send

# Both phases in sequence (default)
python scripts/sunset_check.py run

# Test mode — bypass timing filter for a specific user
python scripts/sunset_check.py check --test-user "+16175551234"
```

### Sunset scoring

Set `SUNSET_SCORER` in `.env`:

- `sunsetwx` (default) — uses the SunsetWx API for professional sunset forecasts
- `openweathermap` — fallback heuristic based on cloud cover, humidity, visibility, and AQI

### Wiring up cron triggers

The Convex backend defines two cron jobs (`sunsetScoreCheck` every 15m, `sendPendingAlerts` every 5m) with placeholder actions. To connect them to this script, you can either:

1. **External cron** — use `crontab`, a systemd timer, or a cloud scheduler to run the Python script on schedule
2. **Convex actions** — replace the placeholder actions in `convex/cronActions.ts` with HTTP calls to a server running this script

## Project Structure

```
convex/
├── schema.ts          # users + alerts tables
├── users.ts           # queries & mutations for user management
├── alerts.ts          # queries & mutations for sunset alerts
├── cronActions.ts     # placeholder actions for cron jobs
└── crons.ts           # sunsetScoreCheck (15m) + sendPendingAlerts (5m)

scripts/
├── sunset_check.py    # main script — Phase 1 (score & queue) + Phase 2 (send)
└── fallback_scorer.py # OpenWeatherMap sunset quality heuristic
```

## Environment Variables

See `.env.example` for all required variables. Key ones:

| Variable | Description |
|---|---|
| `CONVEX_URL` | Your Convex deployment URL |
| `SUNSETWX_API_KEY` | SunsetWx API key (if using sunsetwx scorer) |
| `OPENWEATHERMAP_API_KEY` | OpenWeatherMap API key (if using owm scorer) |
| `TWILIO_ACCOUNT_SID` | Twilio account SID |
| `TWILIO_AUTH_TOKEN` | Twilio auth token |
| `TWILIO_FROM_NUMBER` | Twilio phone number (E.164) |
| `OPENROUTER_API_KEY` | OpenRouter API key for Claude Haiku message generation |
| `SUNSET_QUALITY_THRESHOLD` | Minimum score (0-100) to send an alert (default: 50) |
| `SUNSET_SCORER` | `sunsetwx` or `openweathermap` (default: sunsetwx) |
