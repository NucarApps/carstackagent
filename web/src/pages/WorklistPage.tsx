import { useState } from "react";
import type { OwnerRole } from "@dip/core/types";
import { RoleSwitcher } from "../components/RoleSwitcher";
import { WorklistTable } from "../components/WorklistTable";
import { useWorklist } from "../api/hooks";
import { formatDollars } from "../lib/format";

export function WorklistPage() {
  const [role, setRole] = useState<OwnerRole | undefined>(undefined);
  const [locationId, setLocationId] = useState<string | undefined>(undefined);
  const worklist = useWorklist(role, locationId);

  const items = worklist.data?.items ?? [];
  const totalImpact = items.reduce((sum, i) => sum + i.expectedDollarImpact, 0);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Daily Worklist</h1>
        <p className="text-sm text-slate-500">
          Dollar-ranked recommended actions. Highest-impact first.
        </p>
      </header>

      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <RoleSwitcher
          role={role}
          locationId={locationId}
          onRole={setRole}
          onLocation={setLocationId}
        />
        <div className="rounded-md bg-emerald-50 px-4 py-2 text-right">
          <div className="text-xs uppercase tracking-wide text-emerald-600">Total $ on the table</div>
          <div className="text-lg font-bold text-emerald-700">{formatDollars(totalImpact)}</div>
        </div>
      </div>

      {worklist.isLoading && <p className="text-slate-500">Loading worklist…</p>}
      {worklist.isError && (
        <p className="text-rose-700">
          Could not load the worklist. Is the API running on its configured URL?
        </p>
      )}
      {worklist.isSuccess && <WorklistTable items={items} />}
    </div>
  );
}
