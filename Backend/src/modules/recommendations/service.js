import TaskModel from "../tasks/task.model.js";
import ProjectModel from "../projects/project.model.js";
import TeamModel from "../teams/team.model.js";
import UserModel from "../users/user.model.js";
import { HttpError } from "../../utils/response.js";
import { reasonRecommendation } from "../ai/service.js";
import * as notif from "../notifications/service.js";
import * as taskSvc from "../tasks/service.js";
import { rankNextTasks } from "./scorers/nextTask.js";
import { scoreProjectRisk } from "./scorers/projectRisk.js";
import { suggestRebalance } from "./scorers/rebalancer.js";
import {
  cache,
  nextTaskKey,
  projectRiskKey,
  adminSummaryKey,
  leadSummaryKey,
  rebalanceKey,
  setRiskState,
  getRiskStateLabel,
} from "./cache.js";
import { RISK_LABEL_THRESHOLDS } from "./scorers/weights.js";

// ---------- Visibility helpers ----------

/**
 * Projects this user can view recommendations for. Admin sees all.
 * A user is "in scope" for a project if they are a project member, the team
 * lead, or a member of the owning team. Mirrors the listTasks scoping pattern.
 */
const loadProjectsForUser = async (user) => {
  if (user.role === "admin") {
    return ProjectModel.find({}).populate("team", "name slug lead members");
  }
  const userTeams = await TeamModel.find({
    $or: [{ lead: user.id }, { members: user.id }],
  }).select("_id");
  const teamIds = userTeams.map((t) => t._id);
  return ProjectModel.find({
    $or: [{ members: user.id }, { team: { $in: teamIds } }],
  }).populate("team", "name slug lead members");
};

/**
 * Projects where the user is a "lead" — i.e. would be the audience for
 * project-risk and rebalance signals. Admin always qualifies.
 */
const loadProjectsLedByUser = async (user) => {
  if (user.role === "admin") {
    return ProjectModel.find({}).populate("team", "name slug lead members");
  }
  const ledTeams = await TeamModel.find({ lead: user.id }).select("_id");
  const teamIds = ledTeams.map((t) => t._id);
  return ProjectModel.find({
    $or: [{ team: { $in: teamIds } }, { createdBy: user.id }],
  }).populate("team", "name slug lead members");
};

const isLeadOfProject = (project, user) => {
  if (user.role === "admin") return true;
  if (String(project.createdBy) === String(user.id)) return true;
  if (String(project.team?.lead || "") === String(user.id)) return true;
  return false;
};

const isMemberOfProject = (project, user) => {
  if (user.role === "admin") return true;
  if ((project.members || []).some((m) => String(m._id || m) === String(user.id)))
    return true;
  if (project.team) {
    if (String(project.team.lead || "") === String(user.id)) return true;
    if (
      (project.team.members || []).some(
        (m) => String(m._id || m) === String(user.id),
      )
    )
      return true;
  }
  return false;
};

// ---------- Loaders ----------

const loadCandidatesForUser = async (user) => {
  // Visible projects
  const projects = await loadProjectsForUser(user);
  const projectIds = projects.map((p) => p._id);
  if (projectIds.length === 0) return { tasks: [], depStatusByTaskId: new Map() };

  const tasks = await TaskModel.find({
    project: { $in: projectIds },
    status: { $nin: ["completed", "archived"] },
    $or: [{ assignees: user.id }, { assignees: { $size: 0 } }],
  })
    .sort({ updatedAt: -1 })
    .limit(150)
    .populate("project", "name slug")
    .populate("assignees", "_id name")
    .populate("dependencies", "_id status");

  // Dependency status map (deps already populated above for the candidate set)
  const depStatusByTaskId = new Map();
  for (const t of tasks) {
    for (const d of t.dependencies || []) {
      depStatusByTaskId.set(String(d._id), d.status);
    }
  }
  return { tasks, depStatusByTaskId };
};

const loadProjectScoringInputs = async (project) => {
  const projectId = project._id;
  const tasks = await TaskModel.find({ project: projectId })
    .select(
      "_id title status priority dueDate estimatedHours actualHours assignees dependencies completionDate",
    )
    .populate("assignees", "_id name email");

  const depMap = new Map();
  for (const t of tasks) {
    if ((t.dependencies || []).length) {
      depMap.set(
        String(t._id),
        (t.dependencies || []).map((d) => String(d)),
      );
    }
  }

  // Velocity windows
  const now = Date.now();
  const last7 = new Date(now - 7 * 86_400_000);
  const prev7 = new Date(now - 14 * 86_400_000);
  const completedLast7d = tasks.filter(
    (t) =>
      t.status === "completed" &&
      t.completionDate &&
      new Date(t.completionDate) >= last7,
  ).length;
  const completedPrev7d = tasks.filter(
    (t) =>
      t.status === "completed" &&
      t.completionDate &&
      new Date(t.completionDate) >= prev7 &&
      new Date(t.completionDate) < last7,
  ).length;

  return {
    tasks,
    depMap,
    velocity: { completedLast7d, completedPrev7d },
  };
};

// ---------- Threshold notification ----------

const fireRiskNotificationIfElevated = async (project, scored) => {
  const previousLabel = await getRiskStateLabel(project._id);
  if (previousLabel !== "high" && scored.label === "high") {
    const leadId = project.team?.lead || project.createdBy;
    if (leadId) {
      const top = scored.factors
        .slice()
        .sort((a, b) => b.contribution - a.contribution)
        .slice(0, 2)
        .map((f) => f.name)
        .join(" + ");
      notif.dispatch({
        userId: leadId,
        type: "project_risk_elevated",
        title: `Project "${project.name}" is now at risk`,
        body: top || "Multiple risk factors crossed the threshold.",
        link: `/projects/${project._id}/health`,
        meta: {
          projectId: String(project._id),
          score: scored.score,
          label: scored.label,
        },
      });
    }
  }
  await setRiskState(project._id, scored.label);
};

// ---------- Public service surface ----------

export const getNextTasks = async (user, { limit = 3 } = {}) => {
  const cached = await cache.get(nextTaskKey(user.id));
  if (cached) return cached;

  const { tasks, depStatusByTaskId } = await loadCandidatesForUser(user);
  const now = Date.now();

  const ranked = rankNextTasks({
    userId: user.id,
    candidates: tasks,
    depStatusByTaskId,
    limit,
    now,
  });

  // Attach reasons (LLM-augmented; templated fallback when no key)
  const items = await Promise.all(
    ranked.map(async (r) => {
      const daysUntilDue = r.dueDate
        ? (new Date(r.dueDate).getTime() - now) / 86_400_000
        : null;
      const reason = await reasonRecommendation({
        kind: "next_task",
        payload: {
          title: r.title,
          priority: r.priority,
          status: r.status,
          daysUntilDue,
          factors: r.factors,
        },
      });
      return { ...r, daysUntilDue, reason };
    }),
  );

  const payload = { items, generatedAt: new Date().toISOString() };
  await cache.set(nextTaskKey(user.id), payload);
  return payload;
};

const summarizeForScope = async (user, { limit }) => {
  const projects = await loadProjectsLedByUser(user);
  if (projects.length === 0) return { items: [], generatedAt: new Date().toISOString() };

  const scoredAll = [];
  for (const project of projects) {
    const inputs = await loadProjectScoringInputs(project);
    const scored = scoreProjectRisk({ project, ...inputs });
    // Side effect: fire notification on threshold crossing.
    await fireRiskNotificationIfElevated(project, scored);
    scoredAll.push(scored);
  }
  scoredAll.sort((a, b) => b.score - a.score);

  // Reason for the top entries only — bound LLM calls.
  const top = scoredAll.slice(0, limit);
  const withReasons = await Promise.all(
    top.map(async (s) => {
      const reason = await reasonRecommendation({
        kind: "project_risk",
        payload: {
          name: s.projectName,
          score: s.score,
          label: s.label,
          counts: s.counts,
          factors: s.factors,
        },
      });
      return { ...s, reason };
    }),
  );

  return { items: withReasons, generatedAt: new Date().toISOString() };
};

export const getProjectsAtRisk = async (user, { limit = 5 } = {}) => {
  const key =
    user.role === "admin" ? adminSummaryKey() : leadSummaryKey(user.id);
  const cached = await cache.get(key);
  if (cached) return cached;

  const payload = await summarizeForScope(user, { limit });
  await cache.set(key, payload);
  return payload;
};

export const getProjectHealth = async (projectId, user) => {
  const project = await ProjectModel.findById(projectId).populate(
    "team",
    "name slug lead members",
  );
  if (!project) throw new HttpError(404, "Project not found");
  if (!isMemberOfProject(project, user))
    throw new HttpError(403, "Not a member of this project");

  const cached = await cache.get(projectRiskKey(projectId));
  let scored;
  if (cached) {
    scored = cached;
  } else {
    const inputs = await loadProjectScoringInputs(project);
    scored = scoreProjectRisk({ project, ...inputs });
    await fireRiskNotificationIfElevated(project, scored);
    const reason = await reasonRecommendation({
      kind: "project_risk",
      payload: {
        name: scored.projectName,
        score: scored.score,
        label: scored.label,
        counts: scored.counts,
        factors: scored.factors,
      },
    });
    scored.reason = reason;
    await cache.set(projectRiskKey(projectId), scored);
  }

  // Top slipping task details (for the per-project Health tab UI)
  let slippingTasks = [];
  if (scored.topSlippingTaskIds?.length) {
    slippingTasks = await TaskModel.find({
      _id: { $in: scored.topSlippingTaskIds },
    })
      .select("_id title status priority dueDate assignees")
      .populate("assignees", "name email avatar");
  }

  // Strip detail for non-leads (still see score + label, not the factor breakdown).
  if (!isLeadOfProject(project, user)) {
    return {
      projectId: scored.projectId,
      projectName: scored.projectName,
      score: scored.score,
      label: scored.label,
      reason: scored.reason,
    };
  }

  return { ...scored, slippingTasks };
};

export const getRebalance = async (projectId, user) => {
  const project = await ProjectModel.findById(projectId)
    .populate("team", "name slug lead members")
    .populate("members", "_id name email");
  if (!project) throw new HttpError(404, "Project not found");
  if (!isLeadOfProject(project, user))
    throw new HttpError(403, "Only project leads or admins can view rebalance suggestions");

  const cached = await cache.get(rebalanceKey(projectId));
  if (cached) return cached;

  const tasks = await TaskModel.find({ project: projectId })
    .select("_id title status priority assignees actualHours")
    .populate("assignees", "_id name");

  // Completed-30d per project member, used as the "fit" signal.
  const since = new Date(Date.now() - 30 * 86_400_000);
  const memberIds = (project.members || []).map((m) => m._id);
  const completedAgg = await TaskModel.aggregate([
    {
      $match: {
        project: project._id,
        status: "completed",
        completionDate: { $gte: since },
        assignees: { $in: memberIds },
      },
    },
    { $unwind: "$assignees" },
    { $group: { _id: "$assignees", count: { $sum: 1 } } },
  ]);
  const completedLast30dByUser = new Map(
    completedAgg.map((r) => [String(r._id), r.count]),
  );

  const suggestions = suggestRebalance({
    project,
    tasks,
    completedLast30dByUser,
  });

  const withReasons = await Promise.all(
    suggestions.map(async (s) => {
      const reason = await reasonRecommendation({
        kind: "rebalance",
        payload: {
          fromUserName: s.fromUserName,
          toUserName: s.toUserName,
          taskTitle: s.taskTitle,
          priority: s.priority,
        },
      });
      return { ...s, reason };
    }),
  );

  const payload = {
    projectId,
    projectName: project.name,
    suggestions: withReasons,
    generatedAt: new Date().toISOString(),
  };
  await cache.set(rebalanceKey(projectId), payload);
  return payload;
};

/**
 * Accept a rebalance suggestion. Currently admin-only because tasks/service.js
 * update() restricts assignee mutations to admins. Project leads see the
 * suggestion but the UI gates the button on user.role === "admin". When/if
 * project leads gain task-reassignment authority globally, this gate is the
 * only place to relax.
 */
export const acceptRebalance = async (projectId, body, user) => {
  if (user.role !== "admin") {
    throw new HttpError(
      403,
      "Only admins can apply rebalance suggestions today",
    );
  }
  const { taskId, newAssigneeId } = body;
  const target = await UserModel.findById(newAssigneeId).select("_id");
  if (!target) throw new HttpError(404, "Target user not found");

  const updated = await taskSvc.updateTask(
    taskId,
    { assignees: [newAssigneeId] },
    user,
  );

  // updateTask already busts the task-list cache; recommendations cache will be
  // busted via the tasks/service.js hook.
  return { taskId: updated._id, projectId, newAssigneeId };
};

// re-export for testing / future use
export const _internal = { RISK_LABEL_THRESHOLDS };
