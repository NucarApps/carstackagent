import { Link, useParams } from "react-router-dom";
import { useRecommendation } from "../api/hooks";
import { RecommendationCard } from "../components/RecommendationCard";
import { EvidencePanel } from "../components/EvidencePanel";
import { FeedbackControls } from "../components/FeedbackControls";
import { formatDate, formatDollars } from "../lib/format";

export function RecommendationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const query = useRecommendation(id);
  const rec = query.data;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Link to="/" className="mb-4 inline-block text-sm text-indigo-700 hover:underline">
        ← Back to worklist
      </Link>

      {query.isLoading && <p className="text-slate-500">Loading…</p>}
      {query.isError && <p className="text-rose-700">Could not load this recommendation.</p>}

      {rec && (
        <div className="space-y-5">
          <RecommendationCard rec={rec} />
          <EvidencePanel evidence={rec.evidence} />
          <FeedbackControls recommendationId={rec.recommendationId} actorRole={rec.ownerRole} />

          {rec.feedback.length > 0 && (
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
                Feedback history
              </h3>
              <ul className="space-y-2 text-sm">
                {rec.feedback.map((f, idx) => (
                  <li key={idx} className="flex items-center justify-between border-b border-slate-50 py-1">
                    <span className="font-medium capitalize text-slate-700">{f.action}</span>
                    <span className="text-slate-500">{f.reason ?? f.outcome ?? "—"}</span>
                    <span className="text-slate-400">
                      {f.outcomeDollars != null ? formatDollars(f.outcomeDollars) : ""}
                    </span>
                    <span className="text-xs text-slate-400">{formatDate(f.createdAt)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
