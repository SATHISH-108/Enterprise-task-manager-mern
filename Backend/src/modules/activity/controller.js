import { z } from "zod";
import * as svc from "./service.js";
import { ok, asyncHandler } from "../../utils/response.js";

const listSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(200).default(50),
});

export const listForTask = asyncHandler(async (req, res) => {
  const q = listSchema.parse(req.query);
  const result = await svc.listForTask(req.params.id, req.user, q);
  return ok(res, result);
});

export const listForProject = asyncHandler(async (req, res) => {
  const q = listSchema.parse(req.query);
  const result = await svc.listForProject(req.params.id, req.user, q);
  return ok(res, result);
});
