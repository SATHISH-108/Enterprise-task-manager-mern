import * as svc from "./service.js";
import { ok, created, asyncHandler } from "../../utils/response.js";
import {
  createMilestoneSchema,
  updateMilestoneSchema,
  listMilestonesSchema,
  idParam,
} from "./validators.js";

export const list = asyncHandler(async (req, res) => {
  const q = listMilestonesSchema.parse(req.query);
  const data = await svc.listMilestones(req.user, q);
  return ok(res, data);
});

export const getOne = asyncHandler(async (req, res) => {
  const { id } = idParam.parse(req.params);
  const milestone = await svc.getMilestone(id, req.user);
  return ok(res, { milestone });
});

export const create = asyncHandler(async (req, res) => {
  const body = createMilestoneSchema.parse(req.body);
  const milestone = await svc.createMilestone(req.user, body);
  return created(res, { milestone });
});

export const update = asyncHandler(async (req, res) => {
  const { id } = idParam.parse(req.params);
  const patch = updateMilestoneSchema.parse(req.body);
  const milestone = await svc.updateMilestone(id, patch, req.user);
  return ok(res, { milestone });
});

export const remove = asyncHandler(async (req, res) => {
  const { id } = idParam.parse(req.params);
  await svc.removeMilestone(id, req.user);
  return ok(res, {}, "Milestone deleted");
});
