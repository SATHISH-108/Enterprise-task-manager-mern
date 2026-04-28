import * as svc from "./service.js";
import { listUsersSchema, updateMeSchema } from "./validators.js";
import { ok, asyncHandler } from "../../utils/response.js";

export const listUsers = asyncHandler(async (req, res) => {
  const q = listUsersSchema.parse(req.query);
  const result = await svc.listUsers(q);
  return ok(res, result);
});

export const getUser = asyncHandler(async (req, res) => {
  const user = await svc.getUserById(req.params.id);
  return ok(res, { user });
});

export const updateMe = asyncHandler(async (req, res) => {
  const patch = updateMeSchema.parse(req.body);
  const user = await svc.updateMe(req.user.id, patch);
  return ok(res, { user: user.toSafeJSON() });
});

export const getWorkload = asyncHandler(async (req, res) => {
  const data = await svc.getWorkload(req.params.id);
  return ok(res, data);
});
