import { z } from "zod";
import * as svc from "./service.js";
import { ok, asyncHandler } from "../../utils/response.js";

const rangeSchema = z.object({
  range: z.enum(["7d", "30d"]).default("7d"),
});

export const admin = asyncHandler(async (req, res) => {
  const { range } = rangeSchema.parse(req.query);
  const data = await svc.adminOverview(range);
  return ok(res, data);
});

export const me = asyncHandler(async (req, res) => {
  const { range } = rangeSchema.parse(req.query);
  const data = await svc.userOverview(req.user.id, range);
  return ok(res, data);
});

export const project = asyncHandler(async (req, res) => {
  const data = await svc.projectOverview(req.params.id);
  return ok(res, data);
});

export const activity = asyncHandler(async (_req, res) => {
  const items = await svc.recentActivity(20);
  return ok(res, { items });
});

// ---- Granular endpoints (spec aliases) ----

export const tasksPerDay = asyncHandler(async (req, res) => {
  const { range } = rangeSchema.parse(req.query);
  const data = await svc.adminOverview(range);
  return ok(res, { range, series: data.tasksPerDay || [] });
});

export const completedPerWeek = asyncHandler(async (_req, res) => {
  const data = await svc.completedPerWeek();
  return ok(res, data);
});

export const overdue = asyncHandler(async (_req, res) => {
  const data = await svc.overdueTasks();
  return ok(res, data);
});

export const projectProgress = asyncHandler(async (_req, res) => {
  const data = await svc.allProjectProgress();
  return ok(res, data);
});
