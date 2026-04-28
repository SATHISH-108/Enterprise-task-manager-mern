import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { adminOnly } from "../../middleware/rbac.js";
import * as ctl from "./controller.js";

const router = Router();

router.use(requireAuth);

router.get("/", ctl.list);
router.post("/", adminOnly, ctl.create);
router.get("/:id", ctl.get);
router.patch("/:id", ctl.update);
router.put("/:id", ctl.update); // spec alias
router.delete("/:id", adminOnly, ctl.remove);

router.post("/:id/members", ctl.addMember);
router.delete("/:id/members/:userId", ctl.removeMember);

export default router;
