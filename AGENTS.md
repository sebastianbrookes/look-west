This app has users in many timezones: America/New_York, Europe/Prague, America/Denver, America/Los_Angeles, America/Toronto

<!-- convex-ai-start -->
This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read `convex/_generated/ai/guidelines.md` first** for important guidelines on how to correctly use Convex APIs and patterns. The file contains rules that override what you may have learned about Convex from training data.

Dev (`fiery-deer-214`) and prod (`moonlit-goat-596`) Convex deployments have separate databases. Changes to data (e.g. adding/hiding quotes) in dev are NOT reflected in prod. After modifying data in dev, export and import to prod:
- `rm -f /tmp/export.zip /tmp/export` first (export fails if path exists)
- `npx convex export --path /tmp/export.zip` (exports dev)
- `unzip -o /tmp/export.zip -d /tmp/export`
- `npx convex import --prod --table <table> --replace --yes /tmp/export/<table>/documents.jsonl`
  - `--replace`: required because the table already exists in prod
  - `--yes`: required because the terminal is non-interactive
  - Must run from the project root (Convex needs `package.json`)
<!-- convex-ai-end -->