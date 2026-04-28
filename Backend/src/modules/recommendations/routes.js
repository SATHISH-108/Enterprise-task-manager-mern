import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import * as ctl from "./controller.js";

const router = Router();

router.use(requireAuth);

router.get("/next-tasks", ctl.nextTasks);
router.get("/projects-at-risk", ctl.projectsAtRisk);
router.get("/projects/:id/health", ctl.projectHealth);
router.get("/projects/:id/rebalance", ctl.rebalance);
router.post("/projects/:id/rebalance/accept", ctl.acceptRebalanceCtl);

export default router;
