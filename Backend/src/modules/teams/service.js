import TeamModel from "./team.model.js";
import UserModel from "../users/user.model.js";
import { HttpError } from "../../utils/response.js";
import { slugify, uniqueSlug } from "../../utils/slugify.js";
import logEvent from "../../utils/logEvent.js";

const ensureMember = (team, userId) => {
  const isLead = String(team.lead || "") === String(userId);
  const isMember = (team.members || []).some(
    (m) => String(m._id || m) === String(userId),
  );
  if (!isLead && !isMember)
    throw new HttpError(403, "Not a member of this team");
};

export const listTeamsForUser = async (user) => {
  const query =
    user.role === "admin"
      ? {}
      : { $or: [{ lead: user.id }, { members: user.id }] };
  const teams = await TeamModel.find(query)
    .sort({ createdAt: -1 })
    .populate("lead", "name email avatar")
    .populate("members", "name email avatar");
  return teams;
};

export const createTeam = async (actor, data) => {
  const base = slugify(data.name);
  const slug = await uniqueSlug(TeamModel, base);

  const members = new Set((data.members || []).map(String));
  if (data.lead) members.add(String(data.lead));
  members.add(String(actor.id));

  const team = await TeamModel.create({
    name: data.name,
    slug,
    description: data.description || "",
    lead: data.lead || actor.id,
    members: [...members],
    createdBy: actor.id,
  });

  // sync User.teams for each member
  await UserModel.updateMany(
    { _id: { $in: [...members] } },
    { $addToSet: { teams: team._id } },
  );

  logEvent({
    scope: "team",
    refId: team._id,
    actor: actor.id,
    type: "created",
    message: `created team "${team.name}"`,
  });

  return team;
};

export const getTeam = async (teamId, user) => {
  const team = await TeamModel.findById(teamId)
    .populate("lead", "name email avatar")
    .populate("members", "name email avatar role");
  if (!team) throw new HttpError(404, "Team not found");
  if (user.role !== "admin") ensureMember(team, user.id);
  return team;
};

export const updateTeam = async (teamId, patch, user) => {
  const team = await TeamModel.findById(teamId);
  if (!team) throw new HttpError(404, "Team not found");
  if (user.role !== "admin" && String(team.lead) !== String(user.id)) {
    throw new HttpError(403, "Only team lead or admin can update");
  }

  if (patch.name && patch.name !== team.name) {
    const base = slugify(patch.name);
    team.slug = await uniqueSlug(TeamModel, base);
  }
  Object.assign(team, patch);
  await team.save();

  logEvent({
    scope: "team",
    refId: team._id,
    actor: user.id,
    type: "updated",
    after: patch,
  });

  return team;
};

export const deleteTeam = async (teamId, user) => {
  if (user.role !== "admin") throw new HttpError(403, "Admin only");
  const team = await TeamModel.findByIdAndDelete(teamId);
  if (!team) throw new HttpError(404, "Team not found");
  await UserModel.updateMany({ teams: team._id }, { $pull: { teams: team._id } });
  logEvent({
    scope: "team",
    refId: team._id,
    actor: user.id,
    type: "deleted",
  });
  return team;
};

export const addMember = async (teamId, userId, actor) => {
  const team = await TeamModel.findById(teamId);
  if (!team) throw new HttpError(404, "Team not found");
  if (actor.role !== "admin" && String(team.lead) !== String(actor.id))
    throw new HttpError(403, "Only team lead or admin can add members");
  const user = await UserModel.findById(userId);
  if (!user) throw new HttpError(404, "User not found");

  if (!team.members.some((m) => String(m) === String(userId))) {
    team.members.push(userId);
    await team.save();
  }
  await UserModel.updateOne(
    { _id: userId },
    { $addToSet: { teams: team._id } },
  );

  logEvent({
    scope: "team",
    refId: team._id,
    actor: actor.id,
    type: "updated",
    message: `added ${user.name} to team`,
  });

  return team;
};

export const removeMember = async (teamId, userId, actor) => {
  const team = await TeamModel.findById(teamId);
  if (!team) throw new HttpError(404, "Team not found");
  if (actor.role !== "admin" && String(team.lead) !== String(actor.id))
    throw new HttpError(403, "Only team lead or admin can remove members");
  team.members = team.members.filter((m) => String(m) !== String(userId));
  await team.save();
  await UserModel.updateOne({ _id: userId }, { $pull: { teams: team._id } });

  logEvent({
    scope: "team",
    refId: team._id,
    actor: actor.id,
    type: "updated",
    message: `removed user from team`,
  });

  return team;
};
