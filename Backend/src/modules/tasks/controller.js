import * as svc from "./service.js";
import {
  createTaskSchema,
  updateTaskSchema,
  statusPatchSchema,
  positionPatchSchema,
  listTasksSchema,
  dependencySchema,
} from "./validators.js";
import { ok, created, asyncHandler } from "../../utils/response.js";

export const list = asyncHandler(async (req, res) => {
  const q = listTasksSchema.parse(req.query);
  const result = await svc.listTasks(req.user, q);
  return ok(res, result);
});

export const create = asyncHandler(async (req, res) => {
  const data = createTaskSchema.parse(req.body);
  const task = await svc.createTask(req.user, data);
  return created(res, { task });
});

export const getOne = asyncHandler(async (req, res) => {
  const data = await svc.getTask(req.params.id, req.user);
  return ok(res, data);
});

export const update = asyncHandler(async (req, res) => {
  const patch = updateTaskSchema.parse(req.body);
  const task = await svc.updateTask(req.params.id, patch, req.user);
  return ok(res, { task });
});

export const patchStatus = asyncHandler(async (req, res) => {
  const patch = statusPatchSchema.parse(req.body);
  const task = await svc.patchStatus(req.params.id, patch, req.user);
  return ok(res, { task });
});

export const patchPosition = asyncHandler(async (req, res) => {
  const patch = positionPatchSchema.parse(req.body);
  const task = await svc.patchPosition(req.params.id, patch, req.user);
  return ok(res, { task });
});

export const remove = asyncHandler(async (req, res) => {
  await svc.deleteTask(req.params.id, req.user);
  return ok(res, {}, "Task deleted");
});

export const addDependency = asyncHandler(async (req, res) => {
  const { depId } = dependencySchema.parse(req.body);
  const task = await svc.addDependency(req.params.id, depId, req.user);
  return ok(res, { task });
});

export const removeDependency = asyncHandler(async (req, res) => {
  const task = await svc.removeDependency(
    req.params.id,
    req.params.depId,
    req.user,
  );
  return ok(res, { task });
});

export const listDependencies = asyncHandler(async (req, res) => {
  const data = await svc.listDependencies(req.params.id, req.user);
  return ok(res, data);
});

export const patchAssign = asyncHandler(async (req, res) => {
  const assignees = Array.isArray(req.body?.assignees)
    ? req.body.assignees
    : req.body?.userId
      ? [req.body.userId]
      : [];
  const task = await svc.updateTask(
    req.params.id,
    { assignees },
    req.user,
  );
  return ok(res, { task });
});

export const patchPriority = asyncHandler(async (req, res) => {
  const priority = String(req.body?.priority || "").toLowerCase();
  if (!["low", "medium", "high", "urgent"].includes(priority))
    return res
      .status(400)
      .json({ success: false, message: "priority must be low|medium|high|urgent" });
  const task = await svc.updateTask(req.params.id, { priority }, req.user);
  return ok(res, { task });
});

export const listAttachments = asyncHandler(async (req, res) => {
  const data = await svc.getTask(req.params.id, req.user);
  return ok(res, { attachments: data?.task?.attachments || [] });
});

// ---- Time tracking ----

export const startTimer = asyncHandler(async (req, res) => {
  const note = typeof req.body?.note === "string" ? req.body.note : undefined;
  const data = await svc.startTimer(req.params.id, req.user, { note });
  return ok(res, { entry: data.entry, started: data.started });
});

export const stopTimer = asyncHandler(async (req, res) => {
  const data = await svc.stopTimer(req.params.id, req.user);
  return ok(res, { entry: data.entry, actualHours: data.task.actualHours });
});

export const getRunningTimer = asyncHandler(async (req, res) => {
  const data = await svc.getRunningTimer(req.params.id, req.user);
  return ok(res, data);
});
