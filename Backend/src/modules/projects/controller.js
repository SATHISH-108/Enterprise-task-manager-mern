import * as svc from "./service.js";
import {
  createProjectSchema,
  updateProjectSchema,
  listProjectSchema,
} from "./validators.js";
import { ok, created, asyncHandler } from "../../utils/response.js";

export const list = asyncHandler(async (req, res) => {
  const q = listProjectSchema.parse(req.query);
  const projects = await svc.listProjects(req.user, q);
  return ok(res, { projects });
});

export const create = asyncHandler(async (req, res) => {
  const data = createProjectSchema.parse(req.body);
  const project = await svc.createProject(req.user, data);
  return created(res, { project });
});

export const get = asyncHandler(async (req, res) => {
  const project = await svc.getProject(req.params.id, req.user);
  return ok(res, { project });
});

export const update = asyncHandler(async (req, res) => {
  const patch = updateProjectSchema.parse(req.body);
  const project = await svc.updateProject(req.params.id, patch, req.user);
  return ok(res, { project });
});

export const remove = asyncHandler(async (req, res) => {
  await svc.deleteProject(req.params.id, req.user);
  return ok(res, {}, "Project deleted");
});

export const progress = asyncHandler(async (req, res) => {
  const data = await svc.getProjectProgress(req.params.id, req.user);
  return ok(res, data);
});

export const syncMembers = asyncHandler(async (req, res) => {
  const project = await svc.syncMembersFromTeam(req.params.id, req.user);
  return ok(res, { project }, "Members synced from team");
});

export const addMember = asyncHandler(async (req, res) => {
  const userId = req.body?.userId;
  const project = await svc.addProjectMember(req.params.id, userId, req.user);
  return ok(res, { project }, "Member added");
});

export const removeMember = asyncHandler(async (req, res) => {
  const project = await svc.removeProjectMember(
    req.params.id,
    req.params.userId,
    req.user,
  );
  return ok(res, { project }, "Member removed");
});
