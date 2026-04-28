import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { recommendationsApi } from "./api.js";

const KEYS = {
  next: (userId) => ["recs", "next", userId],
  atRisk: () => ["recs", "at-risk"],
  health: (projectId) => ["recs", "health", projectId],
  rebalance: (projectId) => ["recs", "rebalance", projectId],
};

export const recsKeys = KEYS;

export const useNextTasks = (userId, { enabled = true } = {}) =>
  useQuery({
    queryKey: KEYS.next(userId || "me"),
    queryFn: () => recommendationsApi.nextTasks(3),
    enabled,
    staleTime: 30_000,
  });

export const useProjectsAtRisk = ({ enabled = true } = {}) =>
  useQuery({
    queryKey: KEYS.atRisk(),
    queryFn: () => recommendationsApi.projectsAtRisk(5),
    enabled,
    staleTime: 30_000,
  });

export const useProjectHealth = (projectId, { enabled = true } = {}) =>
  useQuery({
    queryKey: KEYS.health(projectId),
    queryFn: () => recommendationsApi.projectHealth(projectId),
    enabled: enabled && !!projectId,
    staleTime: 30_000,
  });

export const useRebalance = (projectId, { enabled = true } = {}) =>
  useQuery({
    queryKey: KEYS.rebalance(projectId),
    queryFn: () => recommendationsApi.rebalance(projectId),
    enabled: enabled && !!projectId,
    staleTime: 30_000,
  });

export const useAcceptRebalance = (projectId) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, newAssigneeId }) =>
      recommendationsApi.acceptRebalance(projectId, taskId, newAssigneeId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.rebalance(projectId) });
      qc.invalidateQueries({ queryKey: KEYS.health(projectId) });
      qc.invalidateQueries({ queryKey: KEYS.atRisk() });
      qc.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
};
