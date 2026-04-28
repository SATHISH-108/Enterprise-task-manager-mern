import Redis from "ioredis";
import env from "./env.js";
import logger from "./logger.js";

const opts = env.REDIS_URL.startsWith("rediss://") ? { tls: {} } : {};

export const redis = new Redis(env.REDIS_URL, {
  ...opts,
  maxRetriesPerRequest: null,
});

// Dedicated subscriber — ioredis forbids commands on a subscribed connection
export const redisSub = new Redis(env.REDIS_URL, {
  ...opts,
  maxRetriesPerRequest: null,
});

redis.on("error", (e) => logger.error(`Redis error: ${e.message}`));
redisSub.on("error", (e) => logger.error(`RedisSub error: ${e.message}`));
