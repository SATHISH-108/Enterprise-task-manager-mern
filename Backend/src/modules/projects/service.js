import ProjectModel from "./project.model.js";
import TeamModel from "../teams/team.model.js";
import { HttpError } from "../../utils/response.js";
import { slugify, uniqueSlug } from "../../utils/slugify.js";
import logEvent from "../../utils/logEvent.js";

const canManage = (project, team, user) => {
  if (user.role === "admin") return true;
  if (String(project.createdBy) === String(user.id)) return true;
  if (team && String(team.lead) === String(user.id)) return true;
  return false;
};

const isProjectMember = (project, team, user) => {
  if (user.role === "admin") return true;
  if ((project.members || []).some((m) => String(m._id || m) === String(user.id)))
    return true;
  if (team) {
    if (String(team.lead || "") === String(user.id)) return true;
    if ((team.members || []).some((m) => String(m._id || m) === String(user.id)))
      return true;
  }
  return false;
};

export const listProjects = async (user, { team, status }) => {
  const query = {};
  if (team) query.team = team;
  if (status) query.status = status;

  const all = await ProjectModel.find(query)
    .sort({ updatedAt: -1 })
    .populate("team", "name slug lead members")
    .populate("members", "name email avatar");

  if (user.role === "admin") return all;
  return all.filter((p) => isProjectMember(p, p.team, user));
};

export const createProject = async (actor, data) => {
  const team = await TeamModel.findById(data.team);
  if (!team) throw new HttpError(404, "Team not found");

  if (actor.role !== "admin" && String(team.lead) !== String(actor.id)) {
    const isTeamMember = team.members.some(
      (m) => String(m) === String(actor.id),
    );
    if (!isTeamMember) throw new HttpError(403, "Not a member of this team");
  }

  const base = slugify(data.name);
  const slug = await uniqueSlug(ProjectModel, base, { team: team._id });

  // Members default to: anyone explicitly listed, the actor, the team lead,
  // and every team member. Admins can later trim this from the project page.
  const members = new Set((data.members || []).map(String));
  members.add(String(actor.id));
  if (team.lead) members.add(String(team.lead));
  for (const m of team.members || []) members.add(String(m));

  const project = await ProjectModel.create({
    team: team._id,
    name: data.name,
    slug,
    description: data.description || "",
    status: data.status || "active",
    startDate: data.startDate,
    dueDate: data.dueDate,
    members: [...members],
    createdBy: actor.id,
  });

  logEvent({
    scope: "project",
    refId: project._id,
    actor: actor.id,
    type: "created",
    message: `created project "${project.name}"`,
  });

  return project;
};

export const getProject = async (id, user) => {
  const project = await ProjectModel.findById(id)
    .populate("team", "name slug lead members")
    .populate("members", "name email avatar");
  if (!project) throw new HttpError(404, "Project not found");
  if (!isProjectMember(project, project.team, user))
    throw new HttpError(403, "Not a member of this project");
  return project;
};

export const updateProject = async (id, patch, user) => {
  const project = await ProjectModel.findById(id).populate("team");
  if (!project) throw new HttpError(404, "Project not found");
  if (!canManage(project, project.team, user))
    throw new HttpError(403, "Cannot manage this project");

  if (patch.name && patch.name !== project.name) {
    const base = slugify(patch.name);
    project.slug = await uniqueSlug(ProjectModel, base, {
      team: project.team,
      _id: { $ne: project._id },
    });
  }
  Object.assign(project, patch);
  await project.save();

  logEvent({
    scope: "project",
    refId: project._id,
    actor: user.id,
    type: "updated",
    after: patch,
  });

  return project;
};

export const deleteProject = async (id, user) => {
  const project = await ProjectModel.findById(id).populate("team");
  if (!project) throw new HttpError(404, "Project not found");
  if (!canManage(project, project.team, user))
    throw new HttpError(403, "Cannot delete this project");

  await project.deleteOne();
  logEvent({
    scope: "project",
    refId: project._id,
    actor: user.id,
    type: "deleted",
  });
  return project;
};

// Helper re-exported for task service
export const assertProjectMember = async (projectId, user) => {
  const project = await ProjectModel.findById(projectId).populate("team");
  if (!project) throw new HttpError(404, "Project not found");
  if (!isProjectMember(project, project.team, user))
    throw new HttpError(403, "Not a member of this project");
  return project;
};

const canManageMembers = (project, team, actor) => {
  if (actor.role === "admin") return true;
  if (String(project.createdBy) === String(actor.id)) return true;
  if (team && String(team.lead || "") === String(actor.id)) return true;
  return false;
};

export const addProjectMember = async (projectId, userId, actor) => {
  const project = await ProjectModel.findById(projectId).populate("team");
  if (!project) throw new HttpError(404, "Project not found");
  if (!canManageMembers(project, project.team, actor)) {
    throw new HttpError(403, "Not allowed to manage project members");
  }
  if (!userId || String(userId).length !== 24) {
    throw new HttpError(400, "Valid userId required");
  }
  const exists = (project.members || []).some(
    (m) => String(m._id || m) === String(userId),
  );
  if (!exists) {
    project.members.push(userId);
    await project.save();
    logEvent({
      scope: "project",
      refId: project._id,
      actor: actor.id,
      type: "updated",
      message: "added member",
      meta: { addedUser: String(userId) },
    });
  }
  return ProjectModel.findById(project._id)
    .populate("team", "name slug lead members")
    .populate("members", "name email avatar");
};

export const removeProjectMember = async (projectId, userId, actor) => {
  const project = await ProjectModel.findById(projectId).populate("team");
  if (!project) throw new HttpError(404, "Project not found");
  if (!canManageMembers(project, project.team, actor)) {
    throw new HttpError(403, "Not allowed to manage project members");
  }
  project.members = (project.members || []).filter(
    (m) => String(m._id || m) !== String(userId),
  );
  await project.save();
  logEvent({
    scope: "project",
    refId: project._id,
    actor: actor.id,
    type: "updated",
    message: "removed member",
    meta: { removedUser: String(userId) },
  });
  return ProjectModel.findById(project._id)
    .populate("team", "name slug lead members")
    .populate("members", "name email avatar");
};

// Sync a project's members from its team — useful after adding people to a
// team and wanting them to immediately gain access to existing projects.
export const syncMembersFromTeam = async (projectId, actor) => {
  const project = await ProjectModel.findById(projectId).populate("team");
  if (!project) throw new HttpError(404, "Project not found");
  if (actor.role !== "admin" && String(project.team?.lead) !== String(actor.id)) {
    throw new HttpError(403, "Only admins or the team lead can sync members");
  }
  const team = project.team;
  if (!team) return project;

  const members = new Set((project.members || []).map((m) => String(m)));
  if (team.lead) members.add(String(team.lead));
  for (const m of team.members || []) members.add(String(m));

  project.members = [...members];
  await project.save();
  return project;
};

export const getProjectProgress = async (projectId, user) => {
  const TaskModel = (await import("../tasks/task.model.js")).default;
  const project = await assertProjectMember(projectId, user);

  const stats = await TaskModel.aggregate([
    { $match: { project: project._id } },
    { $group: { _id: "$status", count: { $sum: 1 } } },
  ]);
  const byStatus = Object.fromEntries(stats.map((s) => [s._id, s.count]));
  const total = Object.values(byStatus).reduce((a, b) => a + b, 0);
  const completed = byStatus.completed || 0;
  const archived = byStatus.archived || 0;
  const active = total - completed - archived;
  const overdue = await TaskModel.countDocuments({
    project: project._id,
    status: { $nin: ["completed", "archived"] },
    dueDate: { $lt: new Date() },
  });
  const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

  return {
    projectId: project._id,
    projectName: project.name,
    total,
    completed,
    active,
    archived,
    overdue,
    completionRate,
    byStatus,
  };
};
