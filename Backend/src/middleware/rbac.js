import { HttpError } from "../utils/response.js";

/**
 * authorize("admin") or authorize("admin", "manager")
 * Admin always passes. Explicit role list enforced when given.
 */
export const authorize =
  (...allowed) =>
  (req, _res, next) => {
    if (!req.user) return next(new HttpError(401, "Authentication required"));
    if (req.user.role === "admin") return next();
    if (!allowed.length) return next();
    const role = String(req.user.role).toLowerCase();
    if (!allowed.map((r) => r.toLowerCase()).includes(role)) {
      return next(new HttpError(403, "Insufficient role"));
    }
    return next();
  };

export const adminOnly = authorize("admin");

/**
 * Resource-scoped guards — use inside controllers after loading the doc.
 * Kept here so routes can wire them declaratively.
 */
export const isMemberOfTeam = (team, userId) =>
  String(team?.lead) === String(userId) ||
  (team?.members || []).some((m) => String(m) === String(userId));

export const isMemberOfProject = (project, userId) =>
  (project?.members || []).some((m) => String(m) === String(userId));

export const canEditTask = (task, user) => {
  if (!user) return false;
  if (user.role === "admin") return true;
  if (String(task.reporter) === String(user.id)) return true;
  return (task.assignees || []).some((a) => String(a) === String(user.id));
};
