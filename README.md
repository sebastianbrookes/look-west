# Look West

Look West is a full-stack app that sends a double-opt-in email alert when the sunset near you is likely worth seeing, paired with a curated quote.

Live site: https://golookwest.com

![Look West preview](public/web-preview.png)

## Highlights

- React signup flow with Google Places autocomplete and browser geolocation
- Convex backend for users, alerts, unsubscribe tokens, and cron scheduling
- Python alert pipeline for sunset scoring and email delivery orchestration
- Resend-powered confirmation and alert emails
- Tested unsubscribe and account flows with Vitest and `convex-test`

## Tech stack

- React 19 + Vite + TypeScript
- Convex
- Python
- Resend
- Vitest

## Local development

1. Install dependencies:

   ```bash
   npm install
   uv sync
   ```

2. Create local environment variables:

   ```bash
   cp .env.example .env
   ```

3. Start the Convex backend:

   ```bash
   npx convex dev
   ```

   On first run, Convex will create or connect to a project, generate `convex/_generated/*`,
   and print a deployment URL. Copy that URL into `.env` as `CONVEX_URL`.

4. Start the frontend:

   ```bash
   npm run dev
   ```

If you deploy the frontend anywhere other than `https://golookwest.com`, set
`APP_BASE_URL` so confirmation, unsubscribe, and change-location links point to the
correct origin.

## Useful commands

```bash
# Frontend
npm run dev
npm run build
npm run test:once

# Convex
npm run dev:backend

# Generate repo/social preview assets
npm run generate:og

# Alert pipeline
python scripts/alerts/sunset_check.py check
python scripts/alerts/sunset_check.py send
python scripts/alerts/sunset_check.py run
```

## Environment variables

See `.env.example` for the full baseline. The most important values are:

| Variable | Description |
| --- | --- |
| `CONVEX_URL` | Convex deployment URL used by the frontend and scripts |
| `CONVEX_ADMIN_KEY` | Admin key used by the Python pipeline for internal Convex queries |
| `APP_BASE_URL` | Public app origin used to build confirmation and unsubscribe links |
| `EMAIL_BACKGROUND_URL` | Optional override for the email hero image |
| `SUNSETHUE_API_KEY` | SunsetHue API key for the default scorer |
| `OPENWEATHERMAP_API_KEY` | API key for the fallback weather-based scorer |
| `RESEND_API_KEY` | Resend API key for confirmation and alert emails |
| `RESEND_FROM_EMAIL` | Verified sender address for outgoing email |
| `OPENROUTER_API_KEY` | API key used for alert message generation |
| `VITE_GOOGLE_MAPS_API_KEY` | Google Maps API key for location autocomplete |
| `SUNSET_QUALITY_THRESHOLD` | Minimum score required before sending an alert |
| `SUNSET_SCORER` | `sunsethue` or `openweathermap` |

## Project structure

```text
convex/
  alerts.ts
  alertEmails.ts
  cronActions.ts
  crons.ts
  emails.ts
  prompts.ts
  quotes.ts
  schema.ts
  users.ts

public/
  _redirects
  background.webp
  favicon.svg
  og.png
  web-preview.png

scripts/
  alerts/
    fallback_scorer.py
    sunset_check.py
    welcome_email_template.html
  quotes/
    scrape_goodreads.py
  generate-og-image.mjs

src/
  App.tsx
  App.css
  main.tsx
  useGooglePlacesAutocomplete.ts
```

## Notes

- The unsubscribe flow is token-based and requires an explicit confirmation click.
- `scripts/quotes/scrape_goodreads.py` is a one-time content import tool used to seed the
  quotes table during development.
- SPA rewrites for `/confirm`, `/unsubscribe`, and `/change-location` are handled by
  `public/_redirects` and `vercel.json`.
