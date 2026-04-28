import * as svc from "./service.js";
import { createTeamSchema, updateTeamSchema, memberSchema } from "./validators.js";
import { ok, created, asyncHandler } from "../../utils/response.js";

export const list = asyncHandler(async (req, res) => {
  const teams = await svc.listTeamsForUser(req.user);
  return ok(res, { teams });
});

export const create = asyncHandler(async (req, res) => {
  const data = createTeamSchema.parse(req.body);
  const team = await svc.createTeam(req.user, data);
  return created(res, { team });
});

export const get = asyncHandler(async (req, res) => {
  const team = await svc.getTeam(req.params.id, req.user);
  return ok(res, { team });
});

export const update = asyncHandler(async (req, res) => {
  const patch = updateTeamSchema.parse(req.body);
  const team = await svc.updateTeam(req.params.id, patch, req.user);
  return ok(res, { team });
});

export const remove = asyncHandler(async (req, res) => {
  await svc.deleteTeam(req.params.id, req.user);
  return ok(res, {}, "Team deleted");
});

export const addMember = asyncHandler(async (req, res) => {
  const { userId } = memberSchema.parse(req.body);
  const team = await svc.addMember(req.params.id, userId, req.user);
  return ok(res, { team });
});

export const removeMember = asyncHandler(async (req, res) => {
  const team = await svc.removeMember(
    req.params.id,
    req.params.userId,
    req.user,
  );
  return ok(res, { team });
});
