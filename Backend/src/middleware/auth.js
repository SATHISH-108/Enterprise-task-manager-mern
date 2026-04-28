import { verifyAccess } from "../utils/token.js";
import { HttpError } from "../utils/response.js";

/**
 * Populates req.user from accessToken cookie or Authorization: Bearer header.
 * Returns 401 on missing/invalid token.
 */
export const requireAuth = (req, _res, next) => {
  try {
    let token = req.cookies?.accessToken;
    if (!token) {
      const h = req.headers.authorization;
      if (h && h.startsWith("Bearer ")) token = h.slice(7);
    }
    if (!token) throw new HttpError(401, "Authentication required");

    const decoded = verifyAccess(token);
    req.user = { id: decoded.id, role: decoded.role };
    return next();
  } catch (err) {
    if (err instanceof HttpError) return next(err);
    return next(new HttpError(401, "Authentication failed"));
  }
};

/**
 * Soft auth — attaches req.user if a valid token is present but never blocks.
 * Useful for endpoints that personalize but are public.
 */
export const optionalAuth = (req, _res, next) => {
  try {
    let token = req.cookies?.accessToken;
    if (!token) {
      const h = req.headers.authorization;
      if (h && h.startsWith("Bearer ")) token = h.slice(7);
    }
    if (token) {
      const decoded = verifyAccess(token);
      req.user = { id: decoded.id, role: decoded.role };
    }
  } catch {
    // silently ignore
  }
  return next();
};
