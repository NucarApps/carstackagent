# Interaction & Learning Spec

How recommendations are produced, acted on, and how the platform learns from
outcomes — **without ever fine-tuning a model**.

## 1. Lifecycle of a recommendation
```
trigger SQL (deterministic, pre-aggregates)            ← agents service
        │  ranked, already-aggregated slice
        ▼
Claude synthesis (structured output, no arithmetic)    ← agents service
        │  {issue, evidence, action, rationale, $impact, confidence}
        ▼
rec.recommendation  (status=open, dedupe_key, owner_role)
        │
orchestrator: dedupe by dedupe_key, supersede older, rank by $impact
        ▼
rec.worklist  →  rec.v_worklist               ← read by api / web
        │
user action in web: accept | dismiss | snooze (+ reason)
        ▼
rec.recommendation_feedback   (and rec.recommendation.status updated)
        │
later: observed outcome (did the unit sell? gross protected?) recorded as
       feedback.outcome / outcome_dollars
        ▼
weekly learning loop                              ← agents service (learning.ts)
```

## 2. Feedback
`rec.recommendation_feedback` captures the manager action and, later, the
observed outcome:
- `action`: `accept` | `dismiss` | `snooze` (FK `ref.feedback_action`)
- `reason`: free text (esp. for dismiss — this is the richest learning signal)
- `snooze_until`: hides the rec until a date
- `outcome`: e.g. `sold`, `still_aged`, `gross_protected`, `no_change`
- `outcome_dollars`: realized dollars, compared against `expected_dollar_impact`
- `actor_role`, `actor_email`: attribution

Submitting feedback also updates `rec.recommendation.status`
(`accepted`/`dismissed`/`snoozed`).

## 3. The learning loop (never fine-tunes)
Runs weekly (`services/agents/src/learning.ts`). Three mechanisms:

### 3.1 Retune SQL thresholds — `rec.manager_calibration`
Agents read thresholds (e.g. "aged after N days", "min markdown to flag",
"demand-supply ratio to recommend stocking") from `rec.manager_calibration`
rather than hard-coding them. The loop nudges a threshold based on outcomes:
- If a rec_type is **frequently dismissed** with reasons indicating "too
  aggressive," tighten the threshold (fewer, higher-confidence flags).
- If **accepted recs consistently realize their dollars**, the threshold is well
  calibrated — leave it or loosen slightly to surface more.
- Nudges are bounded by `CALIBRATION_LEARN_RATE` and scoped most-specifically
  (a per-`(role, location, rec_type)` value overrides a global default).

### 3.2 Grow a retrieved knowledge base — `rec.manager_knowledge`
The loop distills recurring dismiss-reasons and accepted-rationales into short
knowledge rows (`title`, `body`, `source_feedback_ids[]`, `weight`, scope). At
synthesis time the agents framework **retrieves** the relevant rows by scope and
injects them into the Claude system prompt (RAG). Example: managers repeatedly
dismiss pricing recs on a make because of a known OEM incentive — that becomes a
knowledge row, and future synthesis accounts for it. (Optionally upgrade to
`pgvector` semantic retrieval later.)

### 3.3 Check against outcomes
`rec.learning_run` records each run: how many feedback rows were processed, which
calibration params moved and by how much, which knowledge rows were created or
reweighted. This makes the loop auditable and reversible.

## 4. Why no fine-tuning
The model's job is synthesis and explanation over a small, trustworthy,
pre-aggregated slice — not to memorize dealership-specific thresholds. Those live
in `rec.manager_calibration` (deterministic, inspectable, instantly reversible)
and `rec.manager_knowledge` (retrieved, attributable). This keeps behavior
explainable and avoids the cost, latency, and opacity of fine-tuning.
