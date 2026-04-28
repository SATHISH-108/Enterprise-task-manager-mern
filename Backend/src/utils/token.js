import jwt from "jsonwebtoken";
import crypto from "crypto";
import env, { isProd } from "../config/env.js";
import { redis } from "../config/redis.js";

export const ACCESS_TTL = "15m";
export const ACCESS_TTL_MS = 15 * 60 * 1000;
export const REFRESH_TTL_SECONDS = 7 * 24 * 60 * 60; // 7d
export const REFRESH_TTL_MS = REFRESH_TTL_SECONDS * 1000;

export const accessCookieOpts = {
  httpOnly: true,
  secure: isProd,
  sameSite: isProd ? "none" : "lax",
  maxAge: ACCESS_TTL_MS,
  path: "/",
};

export const refreshCookieOpts = {
  httpOnly: true,
  secure: isProd,
  sameSite: isProd ? "none" : "lax",
  maxAge: REFRESH_TTL_MS,
  path: "/",
};

export const signAccess = (user) =>
  jwt.sign(
    { id: String(user._id || user.id), role: user.role },
    env.JWT_ACCESS_SECRET,
    { expiresIn: ACCESS_TTL },
  );

export const signRefresh = (user) =>
  jwt.sign(
    { id: String(user._id || user.id), role: user.role },
    env.JWT_REFRESH_SECRET,
    { expiresIn: REFRESH_TTL_SECONDS },
  );

export const verifyAccess = (token) => jwt.verify(token, env.JWT_ACCESS_SECRET);
export const verifyRefresh = (token) =>
  jwt.verify(token, env.JWT_REFRESH_SECRET);

// Refresh rotation: per-user Redis key holds the currently-valid refresh JWT.
// On refresh we verify the stored token equals the presented one, then issue
// a new pair and overwrite the stored value.
const refreshKey = (userId) => `refresh:${userId}`;

export const storeRefresh = async (userId, token) => {
  await redis.set(refreshKey(userId), token, "EX", REFRESH_TTL_SECONDS);
};

export const getStoredRefresh = async (userId) => redis.get(refreshKey(userId));

export const clearRefresh = async (userId) => redis.del(refreshKey(userId));

// Opaque tokens for email verification + password reset.
// Only the sha256 digest is stored in Mongo; the user receives the raw token.
export const generateOpaqueToken = () => {
  const raw = crypto.randomBytes(32).toString("hex");
  const hash = crypto.createHash("sha256").update(raw).digest("hex");
  return { raw, hash };
};

export const hashOpaqueToken = (raw) =>
  crypto.createHash("sha256").update(raw).digest("hex");
