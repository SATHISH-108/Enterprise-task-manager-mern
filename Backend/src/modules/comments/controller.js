import { z } from "zod";
import * as svc from "./service.js";
import { ok, created, asyncHandler } from "../../utils/response.js";

const bodySchema = z.object({
  body: z.string().min(1).max(8000),
  mentions: z.array(z.string().length(24)).optional(),
  parent: z.string().length(24).optional(),
});

const editSchema = z.object({ body: z.string().min(1).max(8000) });

const listSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(200).default(50),
});

export const list = asyncHandler(async (req, res) => {
  const q = listSchema.parse(req.query);
  const result = await svc.listComments(req.params.id, req.user, q);
  return ok(res, result);
});

export const add = asyncHandler(async (req, res) => {
  const data = bodySchema.parse(req.body);
  const comment = await svc.addComment(req.params.id, req.user, data);
  return created(res, { comment });
});

export const edit = asyncHandler(async (req, res) => {
  const data = editSchema.parse(req.body);
  const comment = await svc.editComment(req.params.commentId, req.user, data);
  return ok(res, { comment });
});

export const remove = asyncHandler(async (req, res) => {
  await svc.deleteComment(req.params.commentId, req.user);
  return ok(res, {}, "Comment deleted");
});
