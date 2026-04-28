import {
  NEXT_TASK_WEIGHTS,
  NEXT_TASK_PRIORITY_VALUE,
  NEXT_TASK_STATUS_FIT,
} from "./weights.js";

const DAY_MS = 86_400_000;

const urgencyScore = (task, now) => {
  if (!task.dueDate) return 0.2;
  const days = (new Date(task.dueDate).getTime() - now) / DAY_MS;
  if (days < 0) return 1.0;
  return Math.min(1, 1 / Math.max(days, 0.5));
};

const priorityScore = (task) =>
  NEXT_TASK_PRIORITY_VALUE[task.priority] ?? 0.5;

const depReadinessScore = (task, depStatusByTaskId) => {
  const deps = task.dependencies || [];
  if (deps.length === 0) return 1;
  for (const d of deps) {
    const s = depStatusByTaskId.get(String(d._id || d));
    if (s !== "completed" && s !== "archived") return 0;
  }
  return 1;
};

const ownershipScore = (task, userId) => {
  const ids = (task.assignees || []).map((a) => String(a._id || a));
  if (ids.includes(String(userId))) return 1.0;
  if (ids.length === 0) return 0.4;
  return 0;
};

const statusFitScore = (task) => NEXT_TASK_STATUS_FIT[task.status] ?? 0.3;

/**
 * Pure scoring function. Inputs:
 *   userId: the recipient
 *   candidates: array of plain task objects (or mongoose docs) with at least
 *     { _id, title, status, priority, dueDate, assignees, dependencies, project }
 *   depStatusByTaskId: Map<String, String> — status of each dependency referenced
 *     by any candidate. Pass an empty Map if none preloaded.
 *   limit: top-N to return (default 3)
 *   now: timestamp override for tests (default Date.now()).
 */
export const rankNextTasks = ({
  userId,
  candidates,
  depStatusByTaskId = new Map(),
  limit = 3,
  now = Date.now(),
}) => {
  const filtered = candidates.filter(
    (t) => t.status !== "completed" && t.status !== "archived",
  );

  const scored = filtered.map((t) => {
    const factors = {
      urgency: urgencyScore(t, now),
      priority: priorityScore(t),
      depReadiness: depReadinessScore(t, depStatusByTaskId),
      ownership: ownershipScore(t, userId),
      statusFit: statusFitScore(t),
    };
    const score =
      factors.urgency * NEXT_TASK_WEIGHTS.urgency +
      factors.priority * NEXT_TASK_WEIGHTS.priority +
      factors.depReadiness * NEXT_TASK_WEIGHTS.depReadiness +
      factors.ownership * NEXT_TASK_WEIGHTS.ownership +
      factors.statusFit * NEXT_TASK_WEIGHTS.statusFit;

    return {
      taskId: String(t._id),
      title: t.title,
      status: t.status,
      priority: t.priority,
      dueDate: t.dueDate || null,
      project: t.project,
      assigneeCount: (t.assignees || []).length,
      score: Number((score * 100).toFixed(1)),
      factors,
    };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
};
