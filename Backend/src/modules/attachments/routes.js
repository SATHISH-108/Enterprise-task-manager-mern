import { Router } from "express";
import multer from "multer";
import * as ctl from "./controller.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB per file
    files: 10, // cap batch size so one request can't overload Cloudinary
  },
});

// mergeParams so :id (task id) propagates from parent router
const router = Router({ mergeParams: true });

// Accept BOTH field names so legacy single-file callers (`file`) and new
// batch callers (`files[]`) hit the same controller. multer's `fields`
// handler populates `req.files.<name>` as an array per declared field.
router.post(
  "/",
  upload.fields([
    { name: "files", maxCount: 10 },
    { name: "file", maxCount: 1 },
  ]),
  ctl.add,
);
router.delete("/:attachmentId", ctl.remove);

export default router;
