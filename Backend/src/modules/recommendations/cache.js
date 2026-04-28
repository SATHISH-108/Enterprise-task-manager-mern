import { redis } from "../../config/redis.js";
import logger from "../../config/logger.js";

const TTL = 60; // seconds — matches analytics:* pattern
const STATE_TTL = 86_400; // 24h — used for risk-label state for threshold-cross detection

const safeGet = async (key) => {
  try {
    const hit = await redis.get(key);
    return hit ? JSON.parse(hit) : null;
  } catch {
    return null;
  }
};

const safeSet = async (key, value, ttl = TTL) => {
  try {
    await redis.set(key, JSON.stringify(value), "EX", ttl);
  } catch {
    /* ignore */
  }
};

const safeDel = async (keys) => {
  if (!keys.length) return;
  try {
    await redis.del(keys);
  } catch {
    /* ignore */
  }
};

const safeKeys = async (pattern) => {
  try {
    return await redis.keys(pattern);
  } catch {
    return [];
  }
};

// Working caches (60s)
export const nextTaskKey = (userId) => `recs:next:${userId}`;
export const projectRiskKey = (projectId) => `recs:risk:${projectId}`;
export const adminSummaryKey = () => `recs:risk:summary:admin`;
export const leadSummaryKey = (userId) => `recs:risk:summary:lead:${userId}`;
export const rebalanceKey = (projectId) => `recs:rebalance:${projectId}`;

// Threshold-state cache (24h) — never busted by writes, only by recompute.
export const riskStateKey = (projectId) => `recs:risk:state:${projectId}`;

export const cache = {
  get: safeGet,
  set: safeSet,
  del: safeDel,
  keys: safeKeys,
};

export const setRiskState = (projectId, label) =>
  safeSet(riskStateKey(projectId), { label, at: Date.now() }, STATE_TTL);

export const getRiskStateLabel = async (projectId) => {
  const v = await safeGet(riskStateKey(projectId));
  return v?.label || null;
};

/**
 * Invalidate per-user next-task cards + per-project risk + rebalance caches +
 * any summary aggregations that may include this project. Called from
 * tasks/service.js write paths. Best-effort, swallows errors.
 */
export const invalidateRecommendations = async ({
  projectId,
  affectedUserIds = [],
}) => {
  const keys = new Set();
  if (projectId) {
    keys.add(projectRiskKey(projectId));
    keys.add(rebalanceKey(projectId));
  }
  for (const uid of affectedUserIds) {
    if (uid) keys.add(nextTaskKey(uid));
  }
  // Bust admin summary unconditionally; cheap key.
  keys.add(adminSummaryKey());

  // Bust any lead summaries — wildcard.
  const leadKeys = await safeKeys("recs:risk:summary:lead:*");
  leadKeys.forEach((k) => keys.add(k));

  if (keys.size === 0) return;
  await safeDel([...keys]);
  if (process.env.NODE_ENV === "development") {
    logger.debug?.(`recs cache busted (${keys.size} keys)`);
  }
};
