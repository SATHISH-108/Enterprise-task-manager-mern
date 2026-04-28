import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { adminOnly } from "../../middleware/rbac.js";
import * as ctl from "./controller.js";

const router = Router();

router.use(requireAuth);
router.get("/admin", adminOnly, ctl.admin);
router.get("/me", ctl.me);
router.get("/user", ctl.me); // spec alias
router.get("/project/:id", ctl.project);
router.get("/activity", adminOnly, ctl.activity);

router.get("/tasks-per-day", adminOnly, ctl.tasksPerDay);
router.get("/completed-per-week", adminOnly, ctl.completedPerWeek);
router.get("/overdue", adminOnly, ctl.overdue);
router.get("/project-progress", adminOnly, ctl.projectProgress);

export default router;
