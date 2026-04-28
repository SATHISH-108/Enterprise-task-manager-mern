import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import * as ctl from "./controller.js";

const router = Router();

router.use(requireAuth);
router.get("/", ctl.list);
router.get("/unread-count", ctl.unread);
router.post("/:id/read", ctl.read);
router.patch("/:id/read", ctl.read); // spec alias
router.post("/read-all", ctl.readAll);
router.patch("/read-all", ctl.readAll); // spec alias

router.get("/push/key", ctl.pushKey);
router.post("/push/subscribe", ctl.pushSubscribe);
router.post("/push/unsubscribe", ctl.pushUnsubscribe);

export default router;
