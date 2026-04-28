import * as svc from "./service.js";
import { ok, created, asyncHandler } from "../../utils/response.js";
import {
  createWorkspaceSchema,
  updateWorkspaceSchema,
  memberBody,
  teamBody,
  idParam,
} from "./validators.js";

export const list = asyncHandler(async (req, res) => {
  const items = await svc.listWorkspaces(req.user);
  return ok(res, { items });
});

export const getOne = asyncHandler(async (req, res) => {
  const { id } = idParam.parse(req.params);
  const data = await svc.getWorkspace(id, req.user);
  return ok(res, data);
});

export const create = asyncHandler(async (req, res) => {
  const body = createWorkspaceSchema.parse(req.body);
  const ws = await svc.createWorkspace(req.user, body);
  return created(res, { workspace: ws });
});

export const update = asyncHandler(async (req, res) => {
  const { id } = idParam.parse(req.params);
  const patch = updateWorkspaceSchema.parse(req.body);
  const ws = await svc.updateWorkspace(id, patch, req.user);
  return ok(res, { workspace: ws });
});

export const remove = asyncHandler(async (req, res) => {
  const { id } = idParam.parse(req.params);
  await svc.removeWorkspace(id, req.user);
  return ok(res, {}, "Workspace deleted");
});

export const attachTeam = asyncHandler(async (req, res) => {
  const { id } = idParam.parse(req.params);
  const { teamId } = teamBody.parse(req.body);
  const team = await svc.attachTeam(id, teamId, req.user);
  return ok(res, { team });
});

export const detachTeam = asyncHandler(async (req, res) => {
  const { id } = idParam.parse(req.params);
  await svc.detachTeam(id, req.params.teamId, req.user);
  return ok(res, {}, "Team detached");
});

export const addMember = asyncHandler(async (req, res) => {
  const { id } = idParam.parse(req.params);
  const { userId } = memberBody.parse(req.body);
  const ws = await svc.addMember(id, userId, req.user);
  return ok(res, { workspace: ws });
});

export const removeMember = asyncHandler(async (req, res) => {
  const { id } = idParam.parse(req.params);
  const ws = await svc.removeMember(id, req.params.userId, req.user);
  return ok(res, { workspace: ws });
});
