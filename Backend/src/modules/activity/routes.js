import { Router } from "express";
import * as ctl from "./controller.js";

// task-scoped router (mounted under /api/v2/tasks/:id/activity via parent)
const router = Router({ mergeParams: true });
router.get("/", ctl.listForTask);
export default router;

// project-scoped router exported separately; wired in app.js
export const projectActivityRouter = Router({ mergeParams: true });
projectActivityRouter.get("/", ctl.listForProject);
