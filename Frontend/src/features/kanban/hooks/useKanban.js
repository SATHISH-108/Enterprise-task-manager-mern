import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { tasksApi } from "../../../shared/api/endpoints.js";
import {
  joinProject,
  leaveProject,
} from "../../../shared/socket/socketClient.js";
import { useSocketEvent } from "../../../shared/socket/useSocket.js";

export const STATUS_ORDER = [
  "backlog",
  "todo",
  "in_progress",
  "in_review",
  "blocked",
  "completed",
  "archived",
];

export const useProjectTasks = (projectId, filters = {}) => {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["tasks", "project", projectId],
    queryFn: () => tasksApi.list({ project: projectId, limit: 200 }),
    enabled: !!projectId,
  });

  // Live: subscribe to project room + invalidate on task-events
  useEffect(() => {
    if (!projectId) return undefined;
    joinProject(projectId);
    return () => leaveProject(projectId);
  }, [projectId]);

  useSocketEvent("taskUpdated", (payload) => {
    if (!payload || String(payload.projectId) === String(projectId)) {
      qc.invalidateQueries({ queryKey: ["tasks", "project", projectId] });
    }
  });

  const columns = useMemo(() => {
    const items = query.data?.data?.items || [];
    const filtered = items.filter((t) => {
      if (filters.priority && t.priority !== filters.priority) return false;
      if (filters.assignee) {
        const ids = (t.assignees || []).map((a) => String(a._id || a));
        if (!ids.includes(String(filters.assignee))) return false;
      }
      return true;
    });
    const map = Object.fromEntries(STATUS_ORDER.map((s) => [s, []]));
    for (const t of filtered) (map[t.status] || map.todo).push(t);
    for (const s of STATUS_ORDER)
      map[s].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    return map;
  }, [query.data, filters.priority, filters.assignee]);

  return { ...query, columns };
};
