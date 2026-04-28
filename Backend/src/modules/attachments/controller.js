import * as svc from "./service.js";
import { ok, created, asyncHandler } from "../../utils/response.js";
import { HttpError } from "../../utils/response.js";

/**
 * Accepts both legacy single-file uploads (multer field name "file") and
 * the new batch multi-file uploads (field name "files"). The route uses
 * `upload.fields(...)` so either or both arrive populated; we hand
 * everything to the batch service so the on-disk path stays identical.
 *
 * Returns `attachments: [...]` always (single-file upload returns a 1-item
 * array), so callers can rely on a uniform shape.
 */
export const add = asyncHandler(async (req, res) => {
  const files = [
    ...(Array.isArray(req.files?.files) ? req.files.files : []),
    ...(Array.isArray(req.files?.file) ? req.files.file : []),
  ];
  if (files.length === 0) throw new HttpError(400, "No files uploaded");

  const attachments = await svc.addAttachments(req.params.id, req.user, files);
  // Back-compat: emit `attachment` (singular) for the first item too, so
  // older frontend code that destructures `data.attachment` keeps working.
  return created(res, {
    attachments,
    attachment: attachments[0],
    count: attachments.length,
  });
});

export const remove = asyncHandler(async (req, res) => {
  const task = await svc.removeAttachment(
    req.params.id,
    req.params.attachmentId,
    req.user,
  );
  return ok(res, { task }, "Attachment removed");
});
