import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { adminOnly } from "../../middleware/rbac.js";
import * as ctl from "./controller.js";
import * as svc from "./service.js";

const router = Router();

router.use(requireAuth);

router.get("/", ctl.listUsers); // any authed user can browse (for assignee pickers)
router.patch("/me", ctl.updateMe);
router.put("/me", ctl.updateMe); // spec alias
router.get("/:id", ctl.getUser);
router.get("/:id/workload", ctl.getWorkload);

// PUT /:id is admin-only profile update — reuse updateMe logic but allow admin to target any user
router.put("/:id", adminOnly, async (req, res, next) => {
  try {
    const patch = req.body || {};
    const user = await svc.updateMe(req.params.id, patch);
    return res.json({ success: true, data: { user: user.toSafeJSON() } });
  } catch (e) {
    next(e);
  }
});

// reserved for future admin-only actions (ban/unban etc.) — pattern example
router.delete("/:id", adminOnly, (_req, res) =>
  res.status(501).json({ success: false, message: "Not implemented" }),
);

export default router;
