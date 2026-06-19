# Eve agents

The decision agents run on **[Vercel Eve](https://vercel.com/docs/eve)** — an
agent is a directory (`agent/agent.ts` model config, `instructions.md`,
Zod-typed `tools/`, `schedules/` cron, durable execution). `pricing/` is the
**reference** agent; the other seven are built the same way.

> ⚠️ Eve launched 2026-06-17 and is **beta** — verify the `defineAgent` /
> `defineTool` / `defineSchedule` signatures against the current docs. The
> important, stable part is the **reuse pattern** below.

## The pattern (preserves "the LLM never does arithmetic")
The deterministic guarantees stay in code, not the model:
- **`tools/flag-subjects.ts`** runs the existing trigger SQL
  (`@dip/agents` `pricingAgent.trigger`) and returns the SQL-pre-aggregated
  numbers. It caches the rows (incl. the SQL-computed `baseImpact`).
- The model only writes `issue` / `action` / `rationale` / `confidence`.
- **`tools/write-recommendation.ts`** records the row via
  `recRepo.insertOrRefreshRecommendation`, setting `expected_dollar_impact` to
  the **SQL** value (the model never supplies numbers). The partial-unique
  `dedupe_key` index keeps one open rec per subject.

So Eve replaces only the synthesis-call + scheduling layer; all the data rules,
trigger SQL, dedupe, and the `rec.recommendation` contract are reused verbatim
from `@dip/core` / `@dip/agents`.

## Set up locally
Eve scaffolds its own project; this directory holds the agent contents to drop in.

```bash
cd eve/pricing
npx eve@latest init .            # creates the Eve project files around agent/
# Link the workspace packages the tools import:
pnpm add @dip/core@workspace:* @dip/agents@workspace:*   # or file: deps
cp .env.example .env             # ANTHROPIC_API_KEY + a Postgres URL
npm run dev                      # run the agent locally
```

The tools import `@dip/agents/dist/...`, so build the workspace first from the
repo root: `pnpm build`.

## Environment
- `ANTHROPIC_API_KEY` (or a Vercel AI Gateway key) — the model.
- A Postgres URL the tools read via `@dip/core` `loadDatabaseUrl()`:
  `DATABASE_URL` / `POSTGRES_URL` / `SUPABASE_DB_URL` (on Vercel, the Supabase
  integration injects one automatically).

## Deploy
Deploy the Eve project to Vercel (it is "Next.js for agents"). The
`schedules/nightly.ts` cron runs the agent per active store nightly; durable
execution resumes across crashes/deploys. See `../VERCEL.md`.

## Replicate for the other agents
Copy `pricing/` to `stocking/`, `aged-inventory/`, `lead-conversion/`,
`conquest/` (and the fail-soft `photos/`, `gross-fi/`, `ga-vdp/`). In each, the
two tools import that agent from `@dip/agents/dist/agents/<name>.js` and adjust
`instructions.md`. The orchestrator (`recRepo.refreshWorklist`) and the weekly
learning loop become their own Eve `schedules/`.
