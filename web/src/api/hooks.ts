import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { FeedbackRequest, OwnerRole } from "@dip/core/types";
import { api } from "./client";

export function useRoles() {
  return useQuery({ queryKey: ["roles"], queryFn: api.roles });
}

export function useLocations() {
  return useQuery({ queryKey: ["locations"], queryFn: api.locations });
}

export function useWorklist(role?: OwnerRole, locationId?: string) {
  return useQuery({
    queryKey: ["worklist", role ?? null, locationId ?? null],
    queryFn: () => api.worklist(role, locationId),
  });
}

export function useRecommendation(id: string | undefined) {
  return useQuery({
    queryKey: ["recommendation", id],
    queryFn: () => api.recommendation(id as string),
    enabled: Boolean(id),
  });
}

export function useSubmitFeedback() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; body: FeedbackRequest; actorRole?: OwnerRole }) =>
      api.submitFeedback(args.id, args.body, args.actorRole),
    onSuccess: (_data, args) => {
      void qc.invalidateQueries({ queryKey: ["worklist"] });
      void qc.invalidateQueries({ queryKey: ["recommendation", args.id] });
    },
  });
}
