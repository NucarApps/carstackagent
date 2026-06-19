import type { RecommendationDetail } from "@dip/core/types";
import { formatConfidence, formatDate, formatDollars } from "../lib/format";

const STATUS_STYLES: Record<string, string> = {
  open: "bg-indigo-100 text-indigo-700",
  accepted: "bg-emerald-100 text-emerald-700",
  dismissed: "bg-rose-100 text-rose-700",
  snoozed: "bg-amber-100 text-amber-700",
  superseded: "bg-slate-100 text-slate-500",
  expired: "bg-slate-100 text-slate-500",
};

export function RecommendationCard({ rec }: { rec: RecommendationDetail }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="mb-1 flex items-center gap-2 text-xs text-slate-400">
            <span>{rec.agent}</span>
            <span>·</span>
            <span>{rec.ownerRole}</span>
            <span>·</span>
            <span>{rec.locationId}</span>
            <span>·</span>
            <span>{formatDate(rec.createdAt)}</span>
          </div>
          <h1 className="text-xl font-semibold text-slate-900">{rec.issue}</h1>
        </div>
        <span
          className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium ${
            STATUS_STYLES[rec.status] ?? "bg-slate-100 text-slate-600"
          }`}
        >
          {rec.status}
        </span>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <Metric label="Expected $ impact" value={formatDollars(rec.expectedDollarImpact)} emphasis />
        <Metric label="Confidence" value={formatConfidence(rec.confidence)} />
        <Metric label="Subject" value={rec.subjectId} />
      </div>

      <div className="mt-5 space-y-3">
        <Block title="Recommended action" body={rec.action} />
        <Block title="Rationale" body={rec.rationale} />
      </div>
    </div>
  );
}

function Metric({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className="rounded-md bg-slate-50 px-4 py-3">
      <div className="text-xs uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`mt-1 ${emphasis ? "text-lg font-bold text-emerald-700" : "font-medium text-slate-800"}`}>
        {value}
      </div>
    </div>
  );
}

function Block({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</div>
      <p className="mt-1 text-slate-700">{body}</p>
    </div>
  );
}
