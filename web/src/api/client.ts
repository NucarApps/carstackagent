import type {
  FeedbackRequest,
  LocationMeta,
  OwnerRole,
  RecommendationDetail,
  RoleMeta,
  WorklistResponse,
} from "@dip/core/types";

const API_BASE: string =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
  "http://localhost:8080";

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`Request to ${path} failed: ${res.status}`);
  return (await res.json()) as T;
}

export const api = {
  roles: () => getJson<{ roles: RoleMeta[] }>("/meta/roles"),
  locations: () => getJson<{ locations: LocationMeta[] }>("/meta/locations"),

  worklist: (
    role?: OwnerRole,
    locationId?: string,
    cursor = 0,
    limit = 50,
  ): Promise<WorklistResponse> => {
    const p = new URLSearchParams();
    if (role) p.set("role", role);
    if (locationId) p.set("location_id", locationId);
    p.set("cursor", String(cursor));
    p.set("limit", String(limit));
    return getJson<WorklistResponse>(`/worklist?${p.toString()}`);
  },

  recommendation: (id: string) =>
    getJson<RecommendationDetail>(`/recommendations/${id}`),

  submitFeedback: async (
    id: string,
    body: FeedbackRequest,
    actorRole?: OwnerRole,
  ): Promise<{ ok: boolean }> => {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (actorRole) headers["x-dip-role"] = actorRole;
    const res = await fetch(`${API_BASE}/recommendations/${id}/feedback`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Feedback failed: ${res.status}`);
    return (await res.json()) as { ok: boolean };
  },
};
