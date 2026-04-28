import {
  PROJECT_RISK_WEIGHTS,
  BLOCKED_CHAIN_DEPTH_CAP,
  RISK_LABEL_THRESHOLDS,
} from "./weights.js";

const isActive = (t) => t.status !== "completed" && t.status !== "archived";

// Walks each task's dependency graph (already loaded into depMap) and returns
// the longest chain of dependencies that are still in "blocked" status.
const longestBlockedChain = (tasks, depMap) => {
  const blockedIds = new Set(
    tasks.filter((t) => t.status === "blocked").map((t) => String(t._id)),
  );
  if (blockedIds.size === 0) return 0;

  const memo = new Map();
  const walk = (taskId, seen = new Set()) => {
    if (seen.has(taskId)) return 0; // cycle guard
    if (memo.has(taskId)) return memo.get(taskId);
    seen.add(taskId);
    const deps = depMap.get(taskId) || [];
    let best = blockedIds.has(taskId) ? 1 : 0;
    for (const d of deps) {
      const sub = walk(String(d), seen);
      if (blockedIds.has(taskId)) best = Math.max(best, sub + 1);
      else best = Math.max(best, sub);
    }
    seen.delete(taskId);
    memo.set(taskId, best);
    return best;
  };

  let max = 0;
  for (const id of blockedIds) max = Math.max(max, walk(id));
  return max;
};

const stddev = (xs) => {
  if (xs.length === 0) return 0;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const v =
    xs.reduce((acc, x) => acc + (x - mean) ** 2, 0) / xs.length;
  return Math.sqrt(v);
};

/**
 * Score 0–100 for a project's risk of slipping. Pure function.
 *
 * Inputs:
 *   project: { _id, name }
 *   tasks: full task list (active + completed) for this project
 *   depMap: Map<TaskId, TaskId[]> — outbound dependency edges per task
 *   velocity: { completedLast7d, completedPrev7d } — used for velocityDrop
 *   now: timestamp override (default Date.now())
 */
export const scoreProjectRisk = ({
  project,
  tasks,
  depMap = new Map(),
  velocity = { completedLast7d: 0, completedPrev7d: 0 },
  now = Date.now(),
}) => {
  const active = tasks.filter(isActive);
  const activeTotal = active.length;

  // Empty project — no risk to report.
  if (activeTotal === 0) {
    return {
      projectId: project._id,
      projectName: project.name,
      score: 0,
      label: "low",
      factors: [],
      topSlippingTaskIds: [],
    };
  }

  // 1. Overdue ratio
  const overdue = active.filter(
    (t) => t.dueDate && new Date(t.dueDate).getTime() < now,
  );
  const overdueRatio = overdue.length / activeTotal;

  // 2. Slipping ratio: tasks where remaining estimated work won't fit before due date.
  // Approximate "remaining hours" as (estimated - actual), and convert to days at 6h/day.
  const slipping = active.filter((t) => {
    if (!t.dueDate) return false;
    const remainingHours = Math.max(0, (t.estimatedHours || 0) - (t.actualHours || 0));
    if (remainingHours === 0) return false;
    const remainingDays = remainingHours / 6;
    const daysToDue = (new Date(t.dueDate).getTime() - now) / 86_400_000;
    return daysToDue >= 0 && daysToDue < remainingDays;
  });
  const slippingRatio = slipping.length / activeTotal;

  // 3. Longest blocked-chain depth
  const chainDepth = Math.min(
    BLOCKED_CHAIN_DEPTH_CAP,
    longestBlockedChain(active, depMap),
  );
  const blockedChainDepth = chainDepth / BLOCKED_CHAIN_DEPTH_CAP;

  // 4. Workload imbalance: stddev / mean of active tasks per assignee
  const counts = new Map();
  for (const t of active) {
    for (const a of t.assignees || []) {
      const id = String(a._id || a);
      counts.set(id, (counts.get(id) || 0) + 1);
    }
  }
  const loadVals = [...counts.values()];
  let workloadImbalance = 0;
  if (loadVals.length > 1) {
    const mean = loadVals.reduce((a, b) => a + b, 0) / loadVals.length;
    if (mean > 0) workloadImbalance = Math.min(1, stddev(loadVals) / mean);
  }

  // 5. Velocity drop
  const last = velocity.completedLast7d || 0;
  const prev = velocity.completedPrev7d || 0;
  let velocityDrop = 0;
  if (prev > 0) {
    velocityDrop = Math.max(0, Math.min(1, 1 - last / prev));
  } else if (last === 0 && activeTotal > 0) {
    // Nothing completed in either window but there ARE active tasks → mild penalty.
    velocityDrop = 0.3;
  }

  const raw = {
    overdueRatio,
    slippingRatio,
    blockedChainDepth,
    workloadImbalance,
    velocityDrop,
  };

  const factors = [
    {
      name: "overdueRatio",
      weight: PROJECT_RISK_WEIGHTS.overdueRatio,
      raw: Number(overdueRatio.toFixed(3)),
      contribution: Number(
        (overdueRatio * PROJECT_RISK_WEIGHTS.overdueRatio * 100).toFixed(1),
      ),
    },
    {
      name: "slippingRatio",
      weight: PROJECT_RISK_WEIGHTS.slippingRatio,
      raw: Number(slippingRatio.toFixed(3)),
      contribution: Number(
        (slippingRatio * PROJECT_RISK_WEIGHTS.slippingRatio * 100).toFixed(1),
      ),
    },
    {
      name: "blockedChainDepth",
      weight: PROJECT_RISK_WEIGHTS.blockedChainDepth,
      raw: chainDepth,
      contribution: Number(
        (
          blockedChainDepth *
          PROJECT_RISK_WEIGHTS.blockedChainDepth *
          100
        ).toFixed(1),
      ),
    },
    {
      name: "workloadImbalance",
      weight: PROJECT_RISK_WEIGHTS.workloadImbalance,
      raw: Number(workloadImbalance.toFixed(3)),
      contribution: Number(
        (
          workloadImbalance *
          PROJECT_RISK_WEIGHTS.workloadImbalance *
          100
        ).toFixed(1),
      ),
    },
    {
      name: "velocityDrop",
      weight: PROJECT_RISK_WEIGHTS.velocityDrop,
      raw: Number(velocityDrop.toFixed(3)),
      contribution: Number(
        (velocityDrop * PROJECT_RISK_WEIGHTS.velocityDrop * 100).toFixed(1),
      ),
    },
  ];

  const score = Number(
    factors.reduce((a, f) => a + f.contribution, 0).toFixed(1),
  );

  let label = "low";
  if (score >= RISK_LABEL_THRESHOLDS.high) label = "high";
  else if (score >= RISK_LABEL_THRESHOLDS.medium) label = "medium";

  // Top slipping task ids — ranked by daysToDue ASC then priority weight DESC for the UI list
  const topSlippingTaskIds = [...overdue, ...slipping]
    .sort((a, b) => {
      const aDue = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
      const bDue = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
      return aDue - bDue;
    })
    .slice(0, 5)
    .map((t) => String(t._id));

  return {
    projectId: project._id,
    projectName: project.name,
    score,
    label,
    factors,
    raw,
    topSlippingTaskIds,
    counts: {
      activeTotal,
      overdue: overdue.length,
      slipping: slipping.length,
      blocked: active.filter((t) => t.status === "blocked").length,
    },
  };
};
