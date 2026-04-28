import TaskModel from "./task.model.js";
import ProjectModel from "../projects/project.model.js";
import TeamModel from "../teams/team.model.js";
import UserModel from "../users/user.model.js";
import { assertProjectMember } from "../projects/service.js";
import { HttpError } from "../../utils/response.js";
import { escapeRegex } from "../../utils/regex.js";
import logEvent from "../../utils/logEvent.js";
import { redis } from "../../config/redis.js";
import * as notif from "../notifications/service.js";
import { canEditTask } from "../../middleware/rbac.js";
import { invalidateRecommendations } from "../recommendations/cache.js";
import env from "../../config/env.js";

// Status transitions where unmet dependencies should block. "blocked" and the
// terminal/archive statuses are intentionally not gated — a user must be able
// to mark a task as blocked precisely BECAUSE deps aren't ready.
const DEPENDENCY_GATED_STATUSES = new Set([
  "in_progress",
  "in_review",
  "completed",
]);

const assertAssigneesAreProjectMembers = async (project, assigneeIds = []) => {
  if (!assigneeIds.length) return;
  // Allowed = explicit project members ∪ team lead ∪ team members.
  const teamLead = project.team?.lead ? String(project.team.lead) : null;
  const teamMembers = (project.team?.members || []).map((m) =>
    String(m._id || m),
  );
  const projectMembers = (project.members || []).map((m) =>
    String(m._id || m),
  );
  const allowed = new Set([
    ...projectMembers,
    ...teamMembers,
    ...(teamLead ? [teamLead] : []),
  ]);
  const invalid = assigneeIds
    .map(String)
    .filter((id) => !allowed.has(id));
  if (invalid.length) {
    throw new HttpError(
      400,
      `Assignee(s) not part of this project's team: ${invalid.join(", ")}`,
    );
  }
};

const assertDependenciesMet = async (task, newStatus) => {
  if (env.STRICT_DEPENDENCIES === false) return;
  if (!DEPENDENCY_GATED_STATUSES.has(newStatus)) return;
  const depIds = (task.dependencies || []).map((d) => d._id || d);
  if (depIds.length === 0) return;
  const blockers = await TaskModel.find({
    _id: { $in: depIds },
    status: { $nin: ["completed", "archived"] },
  })
    .select("_id title status")
    .lean();
  if (blockers.length) {
    const summary = blockers
      .map((b) => `"${b.title}" (${b.status})`)
      .join(", ");
    throw new HttpError(
      409,
      `Cannot move to ${newStatus} — unmet dependencies: ${summary}`,
    );
  }
};

const TASK_LIST_CACHE_PREFIX = "tasks:list:";
const CACHE_TTL = 2 * 60; // 2 minutes — Kanban should feel live

const invalidateTaskCaches = async () => {
  try {
    const keys = await redis.keys(`${TASK_LIST_CACHE_PREFIX}*`);
    if (keys.length) await redis.del(keys);
  } catch {
    /* ignore */
  }
};

const publishTaskEvent = async (event) => {
  try {
    await redis.publish("task-events", JSON.stringify(event));
  } catch {
    /* ignore */
  }
};

// Collect every user whose "next-task" recommendation might change after a
// write to this task: current + previous assignees, reporter, watchers, and
// the assignees of any task that lists this one as a dependency. Always best-
// effort and de-duplicated.
const collectAffectedUsers = async (task, extraUserIds = []) => {
  const set = new Set(extraUserIds.map(String).filter(Boolean));
  for (const a of task.assignees || []) set.add(String(a._id || a));
  for (const w of task.watchers || []) set.add(String(w._id || w));
  if (task.reporter) set.add(String(task.reporter._id || task.reporter));
  try {
    const dependents = await TaskModel.find({ dependencies: task._id }).select(
      "assignees",
    );
    for (const dep of dependents) {
      for (const a of dep.assignees || []) set.add(String(a._id || a));
    }
  } catch {
    /* ignore */
  }
  return [...set];
};

const bustRecommendations = async (task, extraUserIds = []) => {
  const affected = await collectAffectedUsers(task, extraUserIds);
  invalidateRecommendations({
    projectId: task.project ? String(task.project) : null,
    affectedUserIds: affected,
  }).catch(() => {});
};

// When a task changes (status, assignee, due date, deletion, etc) the
// per-user analytics for everyone involved becomes stale, plus every admin
// dashboard rollup. Both have 60s TTLs by default — busting on write means
// the very next dashboard load reflects the change instead of waiting for
// the cache to expire. Best-effort: a Redis hiccup never blocks the write.
const bustAnalyticsForUsers = async (task, extraUserIds = []) => {
  try {
    const affected = await collectAffectedUsers(task, extraUserIds);
    const keysToDelete = new Set();
    for (const uid of affected) {
      if (!uid) continue;
      // Match the userOverview cache shape: `analytics:user:<uid>:<range>`.
      // We only have two ranges today (7d / 30d) so DEL them by name rather
      // than walking the keyspace with KEYS — cheaper, safer.
      keysToDelete.add(`analytics:user:${uid}:7d`);
      keysToDelete.add(`analytics:user:${uid}:30d`);
    }
    // Admin overview is global — bust both ranges unconditionally on any
    // task change, since it aggregates across every project.
    keysToDelete.add("analytics:admin:7d");
    keysToDelete.add("analytics:admin:30d");
    if (task.project) {
      keysToDelete.add(`analytics:project:${task.project}`);
    }
    if (keysToDelete.size > 0) {
      await redis.del([...keysToDelete]);
    }
  } catch {
    /* ignore — analytics will refresh after TTL */
  }
};

/**
 * Fire an "Activity by user" notification to every admin (except the actor
 * if they happen to be admin). Used to keep admins aware of any edits made
 * by regular users — status changes, title edits, comments, etc.
 */
const notifyAdminsOfUserEdit = async ({ task, actor, action, summary }) => {
  if (!actor || actor.role === "admin") return;
  try {
    const admins = await UserModel.find({ role: "admin" }).select("_id name");
    const actorUser = await UserModel.findById(actor.id).select("name email");
    const actorName = actorUser?.name || actorUser?.email || "A user";
    for (const admin of admins) {
      if (String(admin._id) === String(actor.id)) continue;
      notif.dispatch({
        userId: admin._id,
        type: "task_status_changed",
        title: `${actorName} ${action} "${task.title}"`,
        body: summary,
        link: `/tasks/${task._id}`,
        meta: {
          taskId: task._id,
          projectId: String(task.project),
          actorId: String(actor.id),
          action,
        },
      });
    }
  } catch {
    /* fire-and-forget — never block the primary operation */
  }
};

const assertWriteAccess = async (task, user) => {
  if (!canEditTask(task, user)) {
    // fall back to project membership check for admins / watchers-with-write
    const project = await ProjectModel.findById(task.project).populate("team");
    if (user.role !== "admin") {
      const isMember = (project?.members || []).some(
        (m) => String(m) === String(user.id),
      );
      const isLead = String(project?.team?.lead || "") === String(user.id);
      if (!isMember && !isLead)
        throw new HttpError(403, "Cannot modify this task");
    }
  }
};

const detectCycle = async (taskId, candidateDepId) => {
  if (String(taskId) === String(candidateDepId)) return true;
  const visited = new Set();
  const queue = [String(candidateDepId)];
  while (queue.length) {
    const current = queue.shift();
    if (visited.has(current)) continue;
    visited.add(current);
    if (current === String(taskId)) return true;
    const next = await TaskModel.findById(current).select("dependencies");
    if (!next) continue;
    for (const d of next.dependencies || []) queue.push(String(d));
  }
  return false;
};

export const listTasks = async (user, q) => {
  const query = {};
  if (q.project) query.project = q.project;
  if (q.status) query.status = q.status;
  if (q.priority) query.priority = q.priority;
  if (q.assignee) query.assignees = q.assignee;
  if (q.parent) query.parent = q.parent;
  if (q.q) {
    const safe = escapeRegex(q.q);
    query.$or = [
      { title: { $regex: safe, $options: "i" } },
      { description: { $regex: safe, $options: "i" } },
      { tags: { $in: [new RegExp(safe, "i")] } },
    ];
  }
  if (q.team) {
    const projects = await ProjectModel.find({ team: q.team }).select("_id");
    query.project = { $in: projects.map((p) => p._id) };
  }

  // Scope to projects the user can see (admin sees all). A user "can see" a
  // project if they are an explicit project member OR a member/lead of the
  // owning team. Without the team check, users on a team would get zero tasks
  // for projects they were never explicitly added to.
  if (user.role !== "admin") {
    const userTeams = await TeamModel.find({
      $or: [{ lead: user.id }, { members: user.id }],
    }).select("_id");
    const teamIds = userTeams.map((t) => t._id);
    const projects = await ProjectModel.find({
      $or: [{ members: user.id }, { team: { $in: teamIds } }],
    }).select("_id");
    const allowed = new Set(projects.map((p) => String(p._id)));

    if (query.project) {
      if (Array.isArray(query.project?.$in)) {
        query.project.$in = query.project.$in.filter((id) =>
          allowed.has(String(id)),
        );
      } else if (!allowed.has(String(query.project))) {
        return { items: [], total: 0, page: q.page, pages: 0 };
      }
    } else {
      query.project = { $in: [...allowed] };
    }
  }

  const cacheKey = `${TASK_LIST_CACHE_PREFIX}${JSON.stringify({
    u: user.id,
    r: user.role,
    ...q,
  })}`;
  try {
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached);
  } catch {
    /* ignore */
  }

  const skip = (q.page - 1) * q.limit;
  const [items, total] = await Promise.all([
    TaskModel.find(query)
      .sort({ status: 1, position: 1, updatedAt: -1 })
      .skip(skip)
      .limit(q.limit)
      .populate("assignees", "name email avatar")
      .populate("reporter", "name email avatar")
      .populate("project", "name slug team")
      // Light dep population so the frontend can render an unmet-dep lock
      // without a per-card extra request. Only the status field is selected.
      .populate("dependencies", "status"),
    TaskModel.countDocuments(query),
  ]);

  const payload = {
    items,
    total,
    page: q.page,
    pages: Math.max(1, Math.ceil(total / q.limit)),
  };
  try {
    await redis.set(cacheKey, JSON.stringify(payload), "EX", CACHE_TTL);
  } catch {
    /* ignore */
  }
  return payload;
};

export const getTask = async (id, user) => {
  const task = await TaskModel.findById(id)
    .populate("assignees", "name email avatar")
    .populate("reporter", "name email avatar")
    .populate("watchers", "name email avatar")
    .populate("dependencies", "title status")
    .populate("project", "name slug team");
  if (!task) throw new HttpError(404, "Task not found");

  // read access = project membership
  await assertProjectMember(task.project._id, user);

  // eager-load subtasks
  const subtasks = await TaskModel.find({ parent: task._id })
    .select("title status priority assignees dueDate position")
    .sort({ position: 1 });

  return { task, subtasks };
};

export const createTask = async (actor, data) => {
  const project = await assertProjectMember(data.project, actor);

  // Only admins can pre-assign at creation. Non-admins create unassigned tasks
  // and an admin will assign later.
  if (
    actor.role !== "admin" &&
    Array.isArray(data.assignees) &&
    data.assignees.length > 0
  ) {
    throw new HttpError(403, "Only admins can assign tasks");
  }

  if (Array.isArray(data.assignees) && data.assignees.length > 0) {
    await assertAssigneesAreProjectMembers(project, data.assignees);
  }

  // compute next position in the target column
  const maxPos = await TaskModel.findOne({
    project: data.project,
    status: data.status || "todo",
  })
    .sort({ position: -1 })
    .select("position");
  const position = (maxPos?.position ?? -1) + 1;

  const task = await TaskModel.create({
    ...data,
    position,
    reporter: actor.id,
    status: data.status || "todo",
    priority: data.priority || "medium",
  });

  logEvent({
    scope: "task",
    refId: task._id,
    actor: actor.id,
    type: "created",
    message: `created "${task.title}"`,
    meta: { projectId: data.project },
  });

  // notify assignees
  if (task.assignees?.length) {
    for (const u of task.assignees) {
      notif.dispatch({
        userId: u,
        type: "task_assigned",
        title: `Assigned: ${task.title}`,
        body: `You were assigned to a task in ${project.name}.`,
        link: `/tasks/${task._id}`,
        meta: { taskId: task._id, projectId: data.project },
      });
    }
  }

  await invalidateTaskCaches();
  bustRecommendations(task);
  bustAnalyticsForUsers(task);
  publishTaskEvent({
    type: "created",
    taskId: task._id,
    projectId: String(data.project),
  });

  return task;
};

export const updateTask = async (id, patch, user) => {
  const task = await TaskModel.findById(id);
  if (!task) throw new HttpError(404, "Task not found");
  await assertWriteAccess(task, user);

  // Only admins can change the assignee list. Everyone else with project
  // write access can edit other fields (title, status, due date, etc).
  if (patch.assignees !== undefined && user.role !== "admin") {
    throw new HttpError(403, "Only admins can change assignees");
  }

  if (Array.isArray(patch.assignees) && patch.assignees.length > 0) {
    const project = await ProjectModel.findById(task.project).populate("team");
    await assertAssigneesAreProjectMembers(project, patch.assignees);
  }

  if (patch.status && patch.status !== task.status) {
    await assertDependenciesMet(task, patch.status);
  }

  const before = {
    status: task.status,
    priority: task.priority,
    assignees: task.assignees.map(String),
    dueDate: task.dueDate,
    title: task.title,
  };

  Object.assign(task, patch);

  if (patch.status === "completed" && !task.completionDate) {
    task.completionDate = new Date();
  }
  if (patch.status && patch.status !== "completed") {
    task.completionDate = undefined;
  }

  await task.save();

  // activity: update
  const after = {
    status: task.status,
    priority: task.priority,
    assignees: task.assignees.map(String),
    dueDate: task.dueDate,
    title: task.title,
  };
  // ---- Granular activity events ----
  // The Activity schema's enum supports distinct types per logical change.
  // Emit one entry per change-class so the activity feed is searchable
  // ("which tasks did I get assigned to?" / "which tasks did I complete?")
  // without scanning before/after diffs on every "updated" row.
  const statusChanged = before.status !== after.status;
  if (statusChanged) {
    let statusType = "status_change";
    if (after.status === "completed") statusType = "completed";
    else if (before.status === "completed") statusType = "reopened";
    logEvent({
      scope: "task",
      refId: task._id,
      actor: user.id,
      type: statusType,
      before: { status: before.status },
      after: { status: after.status },
      meta: { projectId: String(task.project) },
    });
  }

  // Assignee diff → one "assigned" entry per added user, "unassigned" per removed.
  const newAssignees = after.assignees.filter(
    (a) => !before.assignees.includes(a),
  );
  const removedAssignees = before.assignees.filter(
    (a) => !after.assignees.includes(a),
  );
  for (const assigneeId of newAssignees) {
    logEvent({
      scope: "task",
      refId: task._id,
      actor: user.id,
      type: "assigned",
      message: "assigned to user",
      meta: { projectId: String(task.project), assigneeId },
    });
  }
  for (const assigneeId of removedAssignees) {
    logEvent({
      scope: "task",
      refId: task._id,
      actor: user.id,
      type: "unassigned",
      message: "removed from assignees",
      meta: { projectId: String(task.project), assigneeId },
    });
  }

  // Other field changes (title, priority, dueDate) → one generic "updated".
  // Skipped if the only changes were status / assignees, which already have
  // their own dedicated entries above — avoids duplicate noise in the feed.
  const otherFieldsChanged =
    before.title !== after.title ||
    before.priority !== after.priority ||
    String(before.dueDate) !== String(after.dueDate);
  if (otherFieldsChanged) {
    logEvent({
      scope: "task",
      refId: task._id,
      actor: user.id,
      type: "updated",
      before,
      after,
      meta: { projectId: String(task.project) },
    });
  }

  for (const u of newAssignees) {
    notif.dispatch({
      userId: u,
      type: "task_assigned",
      title: `Assigned: ${task.title}`,
      body: `You were assigned to a task.`,
      link: `/tasks/${task._id}`,
      meta: { taskId: task._id, projectId: String(task.project) },
    });
  }

  // Status change → notify assignees + reporter + watchers
  if (before.status !== after.status) {
    const targets = new Set(
      [...task.assignees.map(String), String(task.reporter), ...task.watchers.map(String)].filter(
        (u) => u && String(u) !== String(user.id),
      ),
    );
    for (const u of targets) {
      notif.dispatch({
        userId: u,
        type: "task_status_changed",
        title: `"${task.title}" → ${after.status}`,
        body: `Status changed from ${before.status} to ${after.status}.`,
        link: `/tasks/${task._id}`,
        meta: { taskId: task._id, projectId: String(task.project) },
      });
    }
  }

  // Notify admins when a non-admin edits the task
  const changes = [];
  if (before.status !== after.status)
    changes.push(`status: ${before.status} → ${after.status}`);
  if (before.priority !== after.priority)
    changes.push(`priority: ${before.priority} → ${after.priority}`);
  if (before.title !== after.title) changes.push(`title changed`);
  if (String(before.dueDate) !== String(after.dueDate)) changes.push(`due date changed`);
  if (changes.length) {
    notifyAdminsOfUserEdit({
      task,
      actor: user,
      action: "updated",
      summary: changes.join(" · "),
    });
  }

  await invalidateTaskCaches();
  // Old assignees may have lost the task — fold them into the affected set so
  // their next-task cache is busted along with the new owners.
  bustRecommendations(task, before.assignees);
  bustAnalyticsForUsers(task, before.assignees);
  publishTaskEvent({
    type: "updated",
    taskId: task._id,
    projectId: String(task.project),
    status: task.status,
  });

  return task;
};

export const patchStatus = async (id, { status, position }, user) => {
  const task = await TaskModel.findById(id);
  if (!task) throw new HttpError(404, "Task not found");
  await assertWriteAccess(task, user);

  if (status !== task.status) {
    await assertDependenciesMet(task, status);
  }

  const before = task.status;
  task.status = status;
  if (typeof position === "number") task.position = position;
  if (status === "completed") task.completionDate = new Date();
  else task.completionDate = undefined;

  await task.save();

  // patchStatus is the dedicated DnD/explicit-status endpoint. Promote the
  // event type to "completed" / "reopened" when the transition is terminal
  // so the activity feed reads naturally and downstream filters work.
  let statusType = "status_change";
  if (status === "completed") statusType = "completed";
  else if (before === "completed") statusType = "reopened";
  logEvent({
    scope: "task",
    refId: task._id,
    actor: user.id,
    type: statusType,
    before: { status: before },
    after: { status },
    meta: { projectId: String(task.project) },
  });

  notifyAdminsOfUserEdit({
    task,
    actor: user,
    action: status === "completed" ? "completed" : "moved",
    summary: `${before} → ${status}`,
  });

  await invalidateTaskCaches();
  bustRecommendations(task);
  bustAnalyticsForUsers(task);
  publishTaskEvent({
    type: "status_change",
    taskId: task._id,
    projectId: String(task.project),
    status,
    position: task.position,
  });

  return task;
};

export const patchPosition = async (id, { position }, user) => {
  const task = await TaskModel.findById(id);
  if (!task) throw new HttpError(404, "Task not found");
  await assertWriteAccess(task, user);
  task.position = position;
  await task.save();

  await invalidateTaskCaches();
  publishTaskEvent({
    type: "reorder",
    taskId: task._id,
    projectId: String(task.project),
    status: task.status,
    position,
  });
  return task;
};

export const deleteTask = async (id, user) => {
  const task = await TaskModel.findById(id);
  if (!task) throw new HttpError(404, "Task not found");

  // Allowed: admin, reporter (creator), OR any current assignee.
  // The reporter case lets a user undo a task they created by mistake;
  // the assignee case lets someone clear a task that was assigned to them
  // erroneously. Project lead/team lead alone is not enough — they should
  // reassign, not delete other people's work.
  const isAdmin = user.role === "admin";
  const isReporter = String(task.reporter || "") === String(user.id);
  const isAssignee = (task.assignees || []).some(
    (a) => String(a) === String(user.id),
  );
  if (!isAdmin && !isReporter && !isAssignee) {
    throw new HttpError(
      403,
      "Only admins, the task reporter, or an assignee can delete this task",
    );
  }

  await task.deleteOne();
  logEvent({
    scope: "task",
    refId: task._id,
    actor: user.id,
    type: "deleted",
    meta: { projectId: String(task.project) },
  });

  await invalidateTaskCaches();
  bustRecommendations(task);
  bustAnalyticsForUsers(task);
  publishTaskEvent({
    type: "deleted",
    taskId: task._id,
    projectId: String(task.project),
  });
  return task;
};

export const addDependency = async (id, depId, user) => {
  if (String(id) === String(depId))
    throw new HttpError(400, "A task cannot depend on itself");

  const task = await TaskModel.findById(id);
  if (!task) throw new HttpError(404, "Task not found");
  await assertWriteAccess(task, user);

  const dep = await TaskModel.findById(depId);
  if (!dep) throw new HttpError(404, "Dependency task not found");

  // Cross-project dependencies are allowed, but the user must be able to READ
  // the dep task (otherwise we'd leak existence of arbitrary task ids via the
  // relationship). Reuse the project-membership gate.
  await assertProjectMember(dep.project, user);

  if (task.dependencies.some((d) => String(d) === String(depId))) return task;

  if (await detectCycle(id, depId)) {
    throw new HttpError(400, "Cannot add dependency — would create a cycle");
  }

  task.dependencies.push(depId);
  await task.save();

  logEvent({
    scope: "task",
    refId: task._id,
    actor: user.id,
    type: "updated",
    message:
      String(dep.project) === String(task.project)
        ? `added dependency → ${dep.title}`
        : `added cross-project dependency → ${dep.title}`,
    meta: { projectId: String(task.project), depId, depProjectId: String(dep.project) },
  });

  bustRecommendations(task);
  return task;
};

// ---------- Time tracking ----------

export const startTimer = async (id, user, { note } = {}) => {
  const task = await TaskModel.findById(id);
  if (!task) throw new HttpError(404, "Task not found");
  await assertProjectMember(task.project, user);

  // If this user already has a running entry for this task, return it as-is
  // (idempotent — calling start twice is a no-op rather than spawning duplicates).
  const existing = (task.timeEntries || []).find(
    (e) => String(e.user) === String(user.id) && !e.endedAt,
  );
  if (existing) return { task, entry: existing, started: false };

  task.timeEntries.push({
    user: user.id,
    startedAt: new Date(),
    note: note || "",
  });
  await task.save();
  const entry = task.timeEntries[task.timeEntries.length - 1];

  logEvent({
    scope: "task",
    refId: task._id,
    actor: user.id,
    type: "updated",
    message: "started timer",
    meta: { projectId: String(task.project) },
  });

  return { task, entry, started: true };
};

export const stopTimer = async (id, user) => {
  const task = await TaskModel.findById(id);
  if (!task) throw new HttpError(404, "Task not found");
  await assertProjectMember(task.project, user);

  const entry = (task.timeEntries || []).find(
    (e) => String(e.user) === String(user.id) && !e.endedAt,
  );
  if (!entry) {
    throw new HttpError(409, "No running timer for this user on this task");
  }

  const now = new Date();
  entry.endedAt = now;
  entry.hours = Number(
    ((now.getTime() - new Date(entry.startedAt).getTime()) / 3_600_000).toFixed(
      2,
    ),
  );
  // Add to the task's total actualHours so the existing dashboards / delay
  // scoring pick up the elapsed time without any extra plumbing.
  task.actualHours = Number(((task.actualHours || 0) + entry.hours).toFixed(2));

  await task.save();

  logEvent({
    scope: "task",
    refId: task._id,
    actor: user.id,
    type: "updated",
    message: `stopped timer (+${entry.hours}h)`,
    meta: { projectId: String(task.project), hours: entry.hours },
  });

  bustRecommendations(task);
  return { task, entry };
};

export const getRunningTimer = async (id, user) => {
  const task = await TaskModel.findById(id).select("timeEntries project");
  if (!task) throw new HttpError(404, "Task not found");
  await assertProjectMember(task.project, user);
  const entry = (task.timeEntries || []).find(
    (e) => String(e.user) === String(user.id) && !e.endedAt,
  );
  return { running: !!entry, entry: entry || null };
};

export const removeDependency = async (id, depId, user) => {
  const task = await TaskModel.findById(id);
  if (!task) throw new HttpError(404, "Task not found");
  await assertWriteAccess(task, user);

  const before = (task.dependencies || []).length;
  task.dependencies = (task.dependencies || []).filter(
    (d) => String(d) !== String(depId),
  );
  if (task.dependencies.length === before) return task; // no-op, already absent

  await task.save();

  logEvent({
    scope: "task",
    refId: task._id,
    actor: user.id,
    type: "updated",
    message: "removed dependency",
    meta: { projectId: String(task.project), depId },
  });

  bustRecommendations(task);
  return task;
};

export const listDependencies = async (id, user) => {
  const task = await TaskModel.findById(id);
  if (!task) throw new HttpError(404, "Task not found");
  await assertProjectMember(task.project, user);

  const deps = await TaskModel.find({ _id: { $in: task.dependencies || [] } })
    .select("_id title status priority dueDate assignees")
    .populate("assignees", "name email avatar");
  return { dependencies: deps };
};
