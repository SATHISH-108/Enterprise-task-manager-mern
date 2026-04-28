import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import * as ctl from "./controller.js";

const router = Router();

router.use(requireAuth);

router.get("/", ctl.list);
router.post("/", ctl.create);
router.get("/:id", ctl.getOne);
router.patch("/:id", ctl.update);
router.delete("/:id", ctl.remove);

export default router;
