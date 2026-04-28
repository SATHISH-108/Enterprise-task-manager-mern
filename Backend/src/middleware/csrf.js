/**
 * CSRF protection — double-submit cookie pattern.
 *
 * Strategy:
 *   1. On every request, if the `XSRF-TOKEN` cookie is missing, mint one and
 *      set it. The cookie is NOT httpOnly so JavaScript (axios) can read it.
 *   2. For state-changing requests (POST/PUT/PATCH/DELETE) that aren't on the
 *      exempt list, require a matching `X-XSRF-Token` header. The cookie name
 *      and header name match axios' defaults, so the frontend doesn't need
 *      any per-request code — `withCredentials: true` already turns on the
 *      auto-attach behaviour.
 *
 * Why double-submit instead of a synchronizer token store:
 *   - Stateless. No Redis lookup per request.
 *   - SameSite=Lax cookies block third-party POSTs, so this layer is mostly
 *     defence-in-depth — the cookie attacker would need both an XSS that
 *     can read the value AND a CSRF vector, which contradicts each other.
 *
 * Skipping this middleware:
 *   Set CSRF_PROTECTION=false in env to disable the header check (useful for
 *   integration tests or non-browser clients). The cookie is still issued.
 */

import crypto from "crypto";
import env from "../config/env.js";
import { HttpError } from "../utils/response.js";

const COOKIE_NAME = "XSRF-TOKEN";
const HEADER_NAME = "x-xsrf-token"; // express lowercases header names
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// Endpoints that bootstrap a session (no CSRF cookie yet) or are intentionally
// public. Reset links arrive in plain links from email — there's no authed
// session to protect against.
const EXEMPT_PATHS = [
  /^\/api\/v2\/auth\/login$/,
  /^\/api\/v2\/auth\/register$/,
  /^\/api\/v2\/auth\/refresh$/,
  /^\/api\/v2\/auth\/forgot-password$/,
  /^\/api\/v2\/auth\/reset-password\//,
  // V1 alias surface — same exemptions for the legacy paths.
  /^\/auth\/login$/,
  /^\/auth\/register$/,
  /^\/auth\/refresh$/,
  /^\/auth\/forgot-password$/,
  /^\/auth\/reset-password\//,
  /^\/api\/auth\/login$/,
  /^\/api\/auth\/register$/,
  /^\/api\/auth\/refresh$/,
];

const isExempt = (req) => {
  if (SAFE_METHODS.has(req.method)) return true;
  return EXEMPT_PATHS.some((re) => re.test(req.path));
};

const mintToken = () => crypto.randomBytes(24).toString("hex");

export const csrfMiddleware = (req, res, next) => {
  // 1. Ensure the CSRF cookie exists. We set it on every request because
  //    the frontend reads it client-side; it's safe because the value is
  //    only useful when paired with a valid auth cookie.
  let token = req.cookies?.[COOKIE_NAME];
  if (!token) {
    token = mintToken();
    res.cookie(COOKIE_NAME, token, {
      httpOnly: false,
      sameSite: "lax",
      secure: env.NODE_ENV === "production",
      path: "/",
    });
  }

  // 2. Skip enforcement when explicitly disabled (e.g. tests or non-browser
  //    clients), or for safe methods / exempt endpoints.
  if (env.CSRF_PROTECTION === false) return next();
  if (isExempt(req)) return next();

  const sent = req.headers[HEADER_NAME];
  if (!sent || sent !== token) {
    return next(
      new HttpError(403, "CSRF token missing or invalid"),
    );
  }
  return next();
};

export default csrfMiddleware;
