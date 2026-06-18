import { Link } from "react-router-dom";
import type { WorklistItem } from "@dip/core/types";
import { formatConfidence, formatDollars } from "../lib/format";

/** Dollar-ranked worklist rows. The $ impact is the prominent, right-aligned column. */
export function WorklistTable({ items }: { items: WorklistItem[] }) {
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
        No open recommendations for this view. Nice — the worklist is clear.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-slate-100 text-left text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-3 w-12">#</th>
            <th className="px-4 py-3">Issue</th>
            <th className="px-4 py-3">Subject</th>
            <th className="px-4 py-3 w-28 text-center">Confidence</th>
            <th className="px-4 py-3 w-36 text-right">$ Impact</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.recommendationId} className="border-t border-slate-100 hover:bg-slate-50">
              <td className="px-4 py-3 text-slate-400">{item.rank}</td>
              <td className="px-4 py-3">
                <Link
                  to={`/recommendations/${item.recommendationId}`}
                  className="font-medium text-indigo-700 hover:underline"
                >
                  {item.issue}
                </Link>
                <div className="text-xs text-slate-400">
                  {item.agent} · {item.ownerRole} · {item.locationId}
                </div>
              </td>
              <td className="px-4 py-3 text-slate-600">{item.subjectId}</td>
              <td className="px-4 py-3 text-center">
                <span className="inline-block rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                  {formatConfidence(item.confidence)}
                </span>
              </td>
              <td className="px-4 py-3 text-right font-semibold tabular-nums text-emerald-700">
                {formatDollars(item.expectedDollarImpact)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
