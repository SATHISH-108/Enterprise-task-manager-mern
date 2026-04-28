// Tunable weights for the deterministic scorers. Pulled into one file so the
// product team can rebalance ranking behaviour without touching scorer logic.

export const NEXT_TASK_WEIGHTS = {
  urgency: 0.35,
  priority: 0.25,
  depReadiness: 0.2,
  ownership: 0.1,
  statusFit: 0.1,
};

export const NEXT_TASK_PRIORITY_VALUE = {
  urgent: 1.0,
  high: 0.75,
  medium: 0.5,
  low: 0.25,
};

export const NEXT_TASK_STATUS_FIT = {
  todo: 1.0,
  in_progress: 0.9,
  backlog: 0.5,
  in_review: 0.2,
  blocked: 0.2,
};

export const PROJECT_RISK_WEIGHTS = {
  overdueRatio: 0.3,
  slippingRatio: 0.25,
  blockedChainDepth: 0.15,
  workloadImbalance: 0.15,
  velocityDrop: 0.15,
};

// Cap blocked-chain depth at 5 before normalising — anything deeper is "very bad" and
// shouldn't dominate the score with linear growth.
export const BLOCKED_CHAIN_DEPTH_CAP = 5;

// Risk label thresholds — chosen so a project with one overdue task in a small
// backlog doesn't immediately go red.
export const RISK_LABEL_THRESHOLDS = {
  high: 60,
  medium: 30,
};

// Rebalancer thresholds.
export const REBALANCER = {
  // Skip projects where the most-loaded user has fewer than this many active tasks —
  // statistical noise dominates with tiny populations.
  MIN_ACTIVE_FOR_OVERLOAD: 3,
  // Only suggest reassignments that meaningfully reduce stddev.
  MIN_STDDEV_IMPROVEMENT_PCT: 0.1,
  // Cap suggestions per project to keep the panel scannable.
  MAX_SUGGESTIONS: 5,
};
