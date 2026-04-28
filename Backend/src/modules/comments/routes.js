import { Router } from "express";
import * as ctl from "./controller.js";

// mergeParams so :id (task id) from parent router is visible
const router = Router({ mergeParams: true });

router.get("/", ctl.list);
router.post("/", ctl.add);

// edit/delete need the comment id, so nested under parent task's :id
router.patch("/:commentId", ctl.edit);
router.delete("/:commentId", ctl.remove);

export default router;
