import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { milestonesApi } from "./api.js";

export const milestonesKeys = {
  byProject: (projectId) => ["milestones", "project", projectId],
  byTeam: (teamId) => ["milestones", "team", teamId],
  one: (id) => ["milestone", id],
};

export const useProjectMilestones = (projectId, { enabled = true } = {}) =>
  useQuery({
    queryKey: milestonesKeys.byProject(projectId),
    queryFn: () => milestonesApi.list({ project: projectId }),
    enabled: enabled && !!projectId,
  });

export const useTeamMilestones = (teamId, { enabled = true } = {}) =>
  useQuery({
    queryKey: milestonesKeys.byTeam(teamId),
    queryFn: () => milestonesApi.list({ team: teamId }),
    enabled: enabled && !!teamId,
  });

export const useMilestoneMutations = ({ projectId, teamId } = {}) => {
  const qc = useQueryClient();
  const invalidateAll = () => {
    if (projectId)
      qc.invalidateQueries({ queryKey: milestonesKeys.byProject(projectId) });
    if (teamId)
      qc.invalidateQueries({ queryKey: milestonesKeys.byTeam(teamId) });
    qc.invalidateQueries({ queryKey: ["milestones"] });
  };

  return {
    create: useMutation({
      mutationFn: (data) => milestonesApi.create(data),
      onSuccess: invalidateAll,
    }),
    update: useMutation({
      mutationFn: ({ id, patch }) => milestonesApi.update(id, patch),
      onSuccess: invalidateAll,
    }),
    remove: useMutation({
      mutationFn: (id) => milestonesApi.remove(id),
      onSuccess: invalidateAll,
    }),
  };
};
