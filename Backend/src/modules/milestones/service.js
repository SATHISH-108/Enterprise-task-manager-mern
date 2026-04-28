import MilestoneModel from "./milestone.model.js";
import TaskModel from "../tasks/task.model.js";
import ProjectModel from "../projects/project.model.js";
import TeamModel from "../teams/team.model.js";
import { assertProjectMember } from "../projects/service.js";
import { HttpError } from "../../utils/response.js";
import logEvent from "../../utils/logEvent.js";

const isProjectLeadOrAdmin = async (project, user) => {
  if (user.role === "admin") return true;
  if (String(project.createdBy) === String(user.id)) return true;
  const team = project.team?.lead
    ? project.team
    : await TeamModel.findById(project.team).select("lead");
  if (team && String(team.lead || "") === String(user.id)) return true;
  return false;
};

// Compute progress (total / completed / overdue / pct) for a single milestone.
const computeProgress = async (milestoneId) => {
  const now = new Date();
  const [total, completed, overdue] = await Promise.all([
    TaskModel.countDocuments({ milestone: milestoneId }),
    TaskModel.countDocuments({
      milestone: milestoneId,
      status: "completed",
    }),
    TaskModel.countDocuments({
      milestone: milestoneId,
      status: { $nin: ["completed", "archived"] },
      dueDate: { $lt: now },
    }),
  ]);
  return {
    total,
    completed,
    overdue,
    completionPct: total > 0 ? Math.round((completed / total) * 100) : 0,
  };
};

const decorate = async (milestoneDoc) => {
  const m = milestoneDoc.toObject ? milestoneDoc.toObject() : milestoneDoc;
  m.progress = await computeProgress(m._id);
  m.isSprint = !!m.startDate && !!m.dueDate;
  return m;
};

export const listMilestones = async (user, { project, team, status }) => {
  let projectIds = [];
  if (project) {
    await assertProjectMember(project, user);
    projectIds = [project];
  } else if (team) {
    // Caller asked for all milestones across a team's projects. Filter by
    // membership unless admin.
    const projects = await ProjectModel.find({ team }).select("_id members");
    if (user.role === "admin") {
      projectIds = projects.map((p) => p._id);
    } else {
      const userTeam = await TeamModel.findOne({
        _id: team,
        $or: [{ lead: user.id }, { members: user.id }],
      }).select("_id");
      if (userTeam) {
        projectIds = projects.map((p) => p._id);
      } else {
        // Fall back to explicit project membership only.
        projectIds = projects
          .filter((p) =>
            (p.members || []).some((m) => String(m) === String(user.id)),
          )
          .map((p) => p._id);
      }
    }
  }

  if (!projectIds.length) return { items: [] };

  const query = { project: { $in: projectIds } };
  if (status) query.status = status;

  const docs = await MilestoneModel.find(query)
    .sort({ dueDate: 1, createdAt: -1 })
    .populate("project", "name slug team");

  const items = await Promise.all(docs.map(decorate));
  return { items };
};

export const getMilestone = async (id, user) => {
  const m = await MilestoneModel.findById(id).populate(
    "project",
    "name slug team",
  );
  if (!m) throw new HttpError(404, "Milestone not found");
  await assertProjectMember(m.project._id, user);
  return decorate(m);
};

export const createMilestone = async (actor, data) => {
  const project = await assertProjectMember(data.project, actor);
  const m = await MilestoneModel.create({
    project: project._id,
    name: data.name,
    description: data.description || "",
    status: data.status || "upcoming",
    startDate: data.startDate || undefined,
    dueDate: data.dueDate || undefined,
    createdBy: actor.id,
  });
  logEvent({
    scope: "project",
    refId: project._id,
    actor: actor.id,
    type: "created",
    message: `created milestone "${m.name}"`,
    meta: { milestoneId: String(m._id) },
  });
  return decorate(m);
};

export const updateMilestone = async (id, patch, user) => {
  const m = await MilestoneModel.findById(id).populate("project");
  if (!m) throw new HttpError(404, "Milestone not found");
  if (!(await isProjectLeadOrAdmin(m.project, user))) {
    throw new HttpError(403, "Only project leads or admins can edit milestones");
  }

  const before = { status: m.status, name: m.name };
  Object.assign(m, patch);
  await m.save();

  logEvent({
    scope: "project",
    refId: m.project._id,
    actor: user.id,
    type: before.status !== m.status ? "status_change" : "updated",
    message: `milestone "${m.name}" updated`,
    meta: { milestoneId: String(m._id), before, after: { status: m.status, name: m.name } },
  });

  return decorate(m);
};

export const removeMilestone = async (id, user) => {
  const m = await MilestoneModel.findById(id).populate("project");
  if (!m) throw new HttpError(404, "Milestone not found");
  if (!(await isProjectLeadOrAdmin(m.project, user))) {
    throw new HttpError(403, "Only project leads or admins can delete milestones");
  }

  // Unset the milestone field on every task that referenced it; never delete
  // the tasks themselves.
  await TaskModel.updateMany({ milestone: m._id }, { $unset: { milestone: 1 } });

  await m.deleteOne();
  logEvent({
    scope: "project",
    refId: m.project._id,
    actor: user.id,
    type: "deleted",
    message: `milestone "${m.name}" deleted`,
    meta: { milestoneId: String(m._id) },
  });

  return { id };
};
