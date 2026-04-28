import * as svc from "./service.js";
import { ok, asyncHandler } from "../../utils/response.js";
import {
  limitQuery,
  summaryLimitQuery,
  acceptBody,
  idParam,
} from "./validators.js";

export const nextTasks = asyncHandler(async (req, res) => {
  const { limit } = limitQuery.parse(req.query);
  const data = await svc.getNextTasks(req.user, { limit });
  return ok(res, data);
});

export const projectsAtRisk = asyncHandler(async (req, res) => {
  const { limit } = summaryLimitQuery.parse(req.query);
  const data = await svc.getProjectsAtRisk(req.user, { limit });
  return ok(res, data);
});

export const projectHealth = asyncHandler(async (req, res) => {
  const { id } = idParam.parse(req.params);
  const data = await svc.getProjectHealth(id, req.user);
  return ok(res, data);
});

export const rebalance = asyncHandler(async (req, res) => {
  const { id } = idParam.parse(req.params);
  const data = await svc.getRebalance(id, req.user);
  return ok(res, data);
});

export const acceptRebalanceCtl = asyncHandler(async (req, res) => {
  const { id } = idParam.parse(req.params);
  const body = acceptBody.parse(req.body);
  const data = await svc.acceptRebalance(id, body, req.user);
  return ok(res, data, "Reassignment applied");
});
