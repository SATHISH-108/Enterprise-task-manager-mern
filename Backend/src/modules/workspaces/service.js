import WorkspaceModel from "./workspace.model.js";
import TeamModel from "../teams/team.model.js";
import { HttpError } from "../../utils/response.js";
import { slugify, uniqueSlug } from "../../utils/slugify.js";
import logEvent from "../../utils/logEvent.js";

const isOwnerOrAdmin = (workspace, user) => {
  if (user.role === "admin") return true;
  return (workspace.owners || []).some((o) => String(o._id || o) === String(user.id));
};

const isMember = (workspace, user) => {
  if (user.role === "admin") return true;
  if (isOwnerOrAdmin(workspace, user)) return true;
  return (workspace.members || []).some(
    (m) => String(m._id || m) === String(user.id),
  );
};

export const listWorkspaces = async (user) => {
  const query =
    user.role === "admin"
      ? {}
      : { $or: [{ owners: user.id }, { members: user.id }] };
  const items = await WorkspaceModel.find(query)
    .sort({ updatedAt: -1 })
    .populate("owners", "name email avatar")
    .populate("members", "name email avatar");

  // Decorate with team count for each workspace (one round-trip via aggregate).
  const counts = await TeamModel.aggregate([
    { $match: { workspace: { $in: items.map((i) => i._id) } } },
    { $group: { _id: "$workspace", count: { $sum: 1 } } },
  ]);
  const countByWs = Object.fromEntries(counts.map((c) => [String(c._id), c.count]));
  return items.map((i) => ({
    ...i.toObject(),
    teamCount: countByWs[String(i._id)] || 0,
  }));
};

export const getWorkspace = async (id, user) => {
  const ws = await WorkspaceModel.findById(id)
    .populate("owners", "name email avatar")
    .populate("members", "name email avatar");
  if (!ws) throw new HttpError(404, "Workspace not found");
  if (!isMember(ws, user)) throw new HttpError(403, "Not a member of this workspace");

  const teams = await TeamModel.find({ workspace: ws._id })
    .select("name slug lead members")
    .populate("lead", "name email")
    .populate("members", "name email");

  return { workspace: ws, teams };
};

export const createWorkspace = async (actor, data) => {
  // Only system-level admins can create new workspaces. Workspace owners are
  // added later via the manage-members endpoint.
  if (actor.role !== "admin") {
    throw new HttpError(403, "Only system admins can create workspaces");
  }
  const base = slugify(data.name);
  const slug = await uniqueSlug(WorkspaceModel, base);
  const ws = await WorkspaceModel.create({
    name: data.name,
    slug,
    description: data.description || "",
    owners: [actor.id],
    members: [actor.id],
    createdBy: actor.id,
  });
  logEvent({
    scope: "user",
    refId: ws._id,
    actor: actor.id,
    type: "created",
    message: `created workspace "${ws.name}"`,
  });
  return ws;
};

export const updateWorkspace = async (id, patch, user) => {
  const ws = await WorkspaceModel.findById(id);
  if (!ws) throw new HttpError(404, "Workspace not found");
  if (!isOwnerOrAdmin(ws, user))
    throw new HttpError(403, "Only workspace owners or admins can edit");
  Object.assign(ws, patch);
  await ws.save();
  return ws;
};

export const removeWorkspace = async (id, user) => {
  if (user.role !== "admin") {
    throw new HttpError(403, "Only system admins can delete workspaces");
  }
  const ws = await WorkspaceModel.findById(id);
  if (!ws) throw new HttpError(404, "Workspace not found");

  // Don't cascade-delete teams. Just unset their workspace ref so the team
  // becomes top-level again. Lets admins re-bin teams without losing data.
  await TeamModel.updateMany(
    { workspace: ws._id },
    { $unset: { workspace: 1 } },
  );

  await ws.deleteOne();
  return { id };
};

export const attachTeam = async (id, teamId, user) => {
  const ws = await WorkspaceModel.findById(id);
  if (!ws) throw new HttpError(404, "Workspace not found");
  if (!isOwnerOrAdmin(ws, user))
    throw new HttpError(403, "Only workspace owners or admins can manage teams");

  const team = await TeamModel.findById(teamId);
  if (!team) throw new HttpError(404, "Team not found");

  team.workspace = ws._id;
  await team.save();
  return team;
};

export const detachTeam = async (id, teamId, user) => {
  const ws = await WorkspaceModel.findById(id);
  if (!ws) throw new HttpError(404, "Workspace not found");
  if (!isOwnerOrAdmin(ws, user))
    throw new HttpError(403, "Only workspace owners or admins can manage teams");

  await TeamModel.updateOne(
    { _id: teamId, workspace: ws._id },
    { $unset: { workspace: 1 } },
  );
  return { teamId };
};

export const addMember = async (id, userId, actor) => {
  const ws = await WorkspaceModel.findById(id);
  if (!ws) throw new HttpError(404, "Workspace not found");
  if (!isOwnerOrAdmin(ws, actor))
    throw new HttpError(403, "Only workspace owners or admins can add members");
  if (!ws.members.some((m) => String(m) === String(userId))) {
    ws.members.push(userId);
    await ws.save();
  }
  return ws;
};

export const removeMember = async (id, userId, actor) => {
  const ws = await WorkspaceModel.findById(id);
  if (!ws) throw new HttpError(404, "Workspace not found");
  if (!isOwnerOrAdmin(ws, actor))
    throw new HttpError(403, "Only workspace owners or admins can remove members");
  ws.members = ws.members.filter((m) => String(m) !== String(userId));
  ws.owners = ws.owners.filter((o) => String(o) !== String(userId));
  await ws.save();
  return ws;
};
