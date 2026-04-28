import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { aiLimiter } from "../../middleware/rateLimit.js";
import * as ctl from "./controller.js";

const router = Router();

router.use(requireAuth);
router.use(aiLimiter);

router.post("/describe", ctl.describe);
router.post("/generate-task", ctl.describe); // spec alias
router.post("/subtasks", ctl.subtasks);
router.post("/suggest-assignee", ctl.suggestAssignee);
router.post("/nl-search", ctl.nlSearch);
router.post("/search", ctl.nlSearch); // spec alias
router.post("/score-delay", ctl.scoreDelay);
router.post("/predict-delay", ctl.scoreDelay); // spec alias
router.post("/chat", ctl.chat);

export default router;
