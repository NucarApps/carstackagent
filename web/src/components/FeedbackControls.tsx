import { useState } from "react";
import type { FeedbackAction, FeedbackRequest, OwnerRole } from "@dip/core/types";
import { useSubmitFeedback } from "../api/hooks";

interface Props {
  recommendationId: string;
  actorRole?: OwnerRole;
}

/** Accept / dismiss / snooze (+ reason, snooze date, optional outcome). */
export function FeedbackControls({ recommendationId, actorRole }: Props) {
  const [reason, setReason] = useState("");
  const [snoozeUntil, setSnoozeUntil] = useState("");
  const [outcome, setOutcome] = useState("");
  const mutation = useSubmitFeedback();

  const submit = (action: FeedbackAction) => {
    const body: FeedbackRequest = {
      action,
      ...(reason ? { reason } : {}),
      ...(action === "snooze" && snoozeUntil ? { snoozeUntil } : {}),
      ...(outcome ? { outcome } : {}),
    };
    mutation.mutate({ id: recommendationId, body, ...(actorRole ? { actorRole } : {}) });
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
        Feedback
      </h3>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col text-sm">
          <span className="mb-1 text-slate-500">Reason (optional)</span>
          <input
            className="rounded-md border border-slate-300 px-3 py-2"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why accept / dismiss?"
          />
        </label>
        <label className="flex flex-col text-sm">
          <span className="mb-1 text-slate-500">Outcome (optional)</span>
          <input
            className="rounded-md border border-slate-300 px-3 py-2"
            value={outcome}
            onChange={(e) => setOutcome(e.target.value)}
            placeholder="e.g. sold, repriced"
          />
        </label>
        <label className="flex flex-col text-sm">
          <span className="mb-1 text-slate-500">Snooze until (for snooze)</span>
          <input
            type="date"
            className="rounded-md border border-slate-300 px-3 py-2"
            value={snoozeUntil}
            onChange={(e) => setSnoozeUntil(e.target.value)}
          />
        </label>
      </div>

      <div className="mt-4 flex gap-2">
        <button
          onClick={() => submit("accept")}
          disabled={mutation.isPending}
          className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          Accept
        </button>
        <button
          onClick={() => submit("dismiss")}
          disabled={mutation.isPending}
          className="rounded-md bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-50"
        >
          Dismiss
        </button>
        <button
          onClick={() => submit("snooze")}
          disabled={mutation.isPending || !snoozeUntil}
          className="rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50"
        >
          Snooze
        </button>
      </div>

      {mutation.isSuccess && (
        <p className="mt-3 text-sm text-emerald-700">Saved. The worklist has been updated.</p>
      )}
      {mutation.isError && (
        <p className="mt-3 text-sm text-rose-700">Could not save feedback. Try again.</p>
      )}
    </div>
  );
}
