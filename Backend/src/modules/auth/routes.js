import { Router } from "express";
import * as auth from "./controller.js";
import { requireAuth } from "../../middleware/auth.js";
import { loginLimiter, authLimiter } from "../../middleware/rateLimit.js";

const router = Router();

router.post("/register", authLimiter, auth.register);
router.post("/login", loginLimiter, auth.login);
router.post("/refresh", auth.refresh);
router.post("/refresh-token", auth.refresh); // spec alias
router.post("/logout", requireAuth, auth.logout);

router.post("/forgot-password", authLimiter, auth.forgotPassword);
router.post("/reset-password/:token", authLimiter, auth.resetPassword);

router.get("/me", requireAuth, auth.me);
router.post("/change-password", requireAuth, auth.changePassword);

export default router;
