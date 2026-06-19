import { formatEvidence } from "../lib/format";

/**
 * "Show your work": renders the evidence jsonb — exactly the pre-aggregated
 * numbers the SQL computed and the model was shown. Because the model only
 * cites supplied figures, this panel makes every recommendation auditable.
 */
export function EvidencePanel({ evidence }: { evidence: Record<string, unknown> }) {
  const entries = Object.entries(evidence);
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
        Evidence (computed by SQL)
      </h3>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
        {entries.map(([key, value]) => (
          <div key={key} className="flex items-baseline justify-between border-b border-slate-50 py-1">
            <dt className="text-sm text-slate-500">{key}</dt>
            <dd className="text-sm font-medium tabular-nums text-slate-800">
              {formatEvidence(value)}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
