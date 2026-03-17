# fourty-four-sunsets

A sunset alert service that texts you a motivating message to go watch the sunset — but only when it's predicted to be beautiful. Inspired by *The Little Prince*.

## Setup

```bash
npm install
npx convex dev
```

`npx convex dev` will prompt you to create a Convex project on first run, generate the `convex/_generated/` types, deploy your schema, and start watching for changes.

## Project Structure

```
convex/
├── schema.ts       # users + alerts tables
├── users.ts        # queries & mutations for user management
├── alerts.ts       # queries & mutations for sunset alerts
├── cronActions.ts  # placeholder actions for cron jobs
└── crons.ts        # sunsetScoreCheck (15m) + sendPendingAlerts (5m)
```
