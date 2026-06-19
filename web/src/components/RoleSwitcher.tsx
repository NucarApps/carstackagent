import type { OwnerRole } from "@dip/core/types";
import { useLocations, useRoles } from "../api/hooks";

interface Props {
  role: OwnerRole | undefined;
  locationId: string | undefined;
  onRole: (role: OwnerRole | undefined) => void;
  onLocation: (locationId: string | undefined) => void;
}

/** Role + store selectors that drive the worklist query (data from /meta/*). */
export function RoleSwitcher({ role, locationId, onRole, onLocation }: Props) {
  const roles = useRoles();
  const locations = useLocations();

  return (
    <div className="flex flex-wrap items-end gap-4">
      <label className="flex flex-col text-sm">
        <span className="mb-1 font-medium text-slate-600">Role</span>
        <select
          className="rounded-md border border-slate-300 bg-white px-3 py-2 shadow-sm"
          value={role ?? ""}
          onChange={(e) => onRole((e.target.value || undefined) as OwnerRole | undefined)}
        >
          <option value="">All roles (GM)</option>
          {roles.data?.roles.map((r) => (
            <option key={r.ownerRole} value={r.ownerRole}>
              {r.displayName}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col text-sm">
        <span className="mb-1 font-medium text-slate-600">Store</span>
        <select
          className="rounded-md border border-slate-300 bg-white px-3 py-2 shadow-sm"
          value={locationId ?? ""}
          onChange={(e) => onLocation(e.target.value || undefined)}
        >
          <option value="">All stores</option>
          {locations.data?.locations.map((l) => (
            <option key={l.locationId} value={l.locationId}>
              {l.storeName}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
