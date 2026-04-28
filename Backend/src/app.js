import express from "express";
import cookieParser from "cookie-parser";

import {
  corsMiddleware,
  helmetMiddleware,
  sanitizeMiddleware,
} from "./middleware/security.js";
import { csrfMiddleware } from "./middleware/csrf.js";
import { errorHandler, notFound } from "./middleware/error.js";

// ensure models are registered before any router that uses them
import "./modules/users/user.model.js";

import authRouter from "./modules/auth/routes.js";
import usersRouter from "./modules/users/routes.js";
import teamsRouter from "./modules/teams/routes.js";
import projectsRouter from "./modules/projects/routes.js";
import tasksRouter from "./modules/tasks/routes.js";
import notificationsRouter from "./modules/notifications/routes.js";
import analyticsRouter from "./modules/analytics/routes.js";
import aiRouter from "./modules/ai/routes.js";
import recommendationsRouter from "./modules/recommendations/routes.js";
import milestonesRouter from "./modules/milestones/routes.js";
import workspacesRouter from "./modules/workspaces/routes.js";
import { projectActivityRouter } from "./modules/activity/routes.js";
import { requireAuth } from "./middleware/auth.js";

export const buildApp = (io) => {
  const app = express();

  app.disable("x-powered-by");

  app.use(helmetMiddleware);
  app.use(corsMiddleware);
  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.use(sanitizeMiddleware);
  app.use(csrfMiddleware);

  // attach socket.io to every request so controllers can emit directly
  app.use((req, _res, next) => {
    req.io = io;
    next();
  });

  app.get("/", (_req, res) =>
    res.json({ success: true, message: "MERN Task Manager API v2" }),
  );
  app.get("/health", (_req, res) =>
    res.json({ success: true, uptime: process.uptime() }),
  );

  // CSRF token bootstrap. Frontend hits this once on app boot (or after a
  // 403 retry) to GUARANTEE the XSRF-TOKEN cookie is set before any mutation.
  // The csrfMiddleware that ran above this handler already minted + set the
  // cookie if it was missing; this endpoint just exposes the value so the
  // client can confirm receipt and short-circuit any race condition.
  app.get("/api/v2/csrf", (req, res) => {
    res.json({
      success: true,
      data: { token: req.cookies?.["XSRF-TOKEN"] || null },
    });
  });

  // ----- V2 (canonical) -----
  app.use("/api/v2/auth", authRouter);
  app.use("/api/v2/users", usersRouter);
  app.use("/api/v2/teams", teamsRouter);
  app.use("/api/v2/projects", projectsRouter);
  app.use("/api/v2/tasks", tasksRouter);
  app.use("/api/v2/notifications", notificationsRouter);
  app.use("/api/v2/analytics", analyticsRouter);
  app.use("/api/v2/ai", aiRouter);
  app.use("/api/v2/recommendations", recommendationsRouter);
  app.use("/api/v2/milestones", milestonesRouter);
  app.use("/api/v2/workspaces", workspacesRouter);
  app.use("/api/v2/projects/:id/activity", requireAuth, projectActivityRouter);

  // ----- V1 (legacy aliases — same handlers, both prefixes work) -----
  // Original V1 mounted routes at `/auth`, `/tasks`, `/dashboard`, and
  // versionless `/api/*`. Cleanup in 2026-04-25 deleted V1 source code in
  // favour of the modular V2 codebase. Re-mounting V2 routers on the V1 URL
  // prefixes lets V1-era clients (and any docs / Postman collections that
  // reference them) keep working — the single canonical implementation
  // lives in V2 and is served from every URL surface.
  //
  // Response envelopes are V2's `{success, data}` shape. The pre-cleanup V1
  // adapter is still preserved in git history if a strict V1 wire shape is
  // ever needed.
  app.use("/api/auth", authRouter);
  app.use("/auth", authRouter);
  app.use("/api/users", usersRouter);
  app.use("/api/teams", teamsRouter);
  app.use("/api/projects", projectsRouter);
  app.use("/api/tasks", tasksRouter);
  app.use("/tasks", tasksRouter);
  app.use("/api/notifications", notificationsRouter);
  app.use("/api/dashboard", analyticsRouter); // V1's `/dashboard` was the admin overview
  app.use("/dashboard", analyticsRouter);
  app.use("/api/analytics", analyticsRouter);
  app.use("/api/ai", aiRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
};

export default buildApp;
