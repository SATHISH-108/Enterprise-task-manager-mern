import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import * as ctl from "./controller.js";

// sub-routers
import commentRouter from "../comments/routes.js";
import activityRouter from "../activity/routes.js";
import attachmentRouter from "../attachments/routes.js";

const router = Router();

router.use(requireAuth);

router.get("/", ctl.list);
router.post("/", ctl.create);
router.get("/:id", ctl.getOne);
router.patch("/:id", ctl.update);
router.put("/:id", ctl.update); // spec alias
router.patch("/:id/status", ctl.patchStatus);
router.patch("/:id/position", ctl.patchPosition);
router.patch("/:id/assign", ctl.patchAssign);
router.patch("/:id/priority", ctl.patchPriority);
router.delete("/:id", ctl.remove);
router.post("/:id/dependencies", ctl.addDependency);
router.get("/:id/dependencies", ctl.listDependencies);
router.delete("/:id/dependencies/:depId", ctl.removeDependency);

router.get("/:id/timer", ctl.getRunningTimer);
router.post("/:id/timer/start", ctl.startTimer);
router.post("/:id/timer/stop", ctl.stopTimer);
router.get("/:id/attachments", ctl.listAttachments);

router.use("/:id/comments", commentRouter);
router.use("/:id/activity", activityRouter);
router.use("/:id/attachments", attachmentRouter);

export default router;
