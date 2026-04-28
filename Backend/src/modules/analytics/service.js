import TaskModel from "../tasks/task.model.js";
import ProjectModel from "../projects/project.model.js";
import UserModel from "../users/user.model.js";
import ActivityModel from "../activity/activity.model.js";
import { redis } from "../../config/redis.js";

const CACHE_TTL = 60; // 1 min — dashboards are tolerant

const rangeStart = (range) => {
  const days = range === "30d" ? 30 : 7;
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - (days - 1));
  return { start: d, days };
};

const buildEmptySeries = (days) => {
  const out = [];
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    out.push({ date: d.toISOString().slice(0, 10), count: 0 });
  }
  return out;
};

const cached = async (key, ttl, loader) => {
  try {
    const hit = await redis.get(key);
    if (hit) return JSON.parse(hit);
  } catch {
    /* ignore */
  }
  const value = await loader();
  try {
    await redis.set(key, JSON.stringify(value), "EX", ttl);
  } catch {
    /* ignore */
  }
  return value;
};

// ---------- Admin ----------

export const adminOverview = async (range = "7d") =>
  cached(`analytics:admin:${range}`, CACHE_TTL, async () => {
    const { start, days } = rangeStart(range);
    const now = new Date();

    const [
      totalUsers,
      totalTeams,
      totalProjects,
      totalTasks,
      completedTasks,
      overdueTasks,
      byPriority,
      byStatus,
      perDayRaw,
      topUsers,
      projectCompletion,
    ] = await Promise.all([
      UserModel.countDocuments(),
      // lazy count — don't populate
      // eslint-disable-next-line import/no-named-as-default-member
      (await import("../teams/team.model.js")).default.countDocuments(),
      ProjectModel.countDocuments(),
      TaskModel.countDocuments(),
      TaskModel.countDocuments({ status: "completed" }),
      TaskModel.countDocuments({
        dueDate: { $lt: now },
        status: { $nin: ["completed", "archived"] },
      }),
      TaskModel.aggregate([
        { $group: { _id: "$priority", count: { $sum: 1 } } },
      ]),
      TaskModel.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
      TaskModel.aggregate([
        { $match: { createdAt: { $gte: start } } },
        {
          $group: {
            _id: {
              $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
            },
            count: { $sum: 1 },
          },
        },
      ]),
      TaskModel.aggregate([
        { $match: { assignees: { $ne: [] } } },
        { $unwind: "$assignees" },
        { $group: { _id: "$assignees", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 5 },
        {
          $lookup: {
            from: "users",
            localField: "_id",
            foreignField: "_id",
            as: "user",
          },
        },
        { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
        {
          $project: {
            _id: 1,
            count: 1,
            name: "$user.name",
            email: "$user.email",
          },
        },
      ]),
      ProjectModel.aggregate([
        {
          $lookup: {
            from: "tasks",
            localField: "_id",
            foreignField: "project",
            as: "tasks",
          },
        },
        {
          $project: {
            name: 1,
            slug: 1,
            total: { $size: "$tasks" },
            completed: {
              $size: {
                $filter: {
                  input: "$tasks",
                  as: "t",
                  cond: { $eq: ["$$t.status", "completed"] },
                },
              },
            },
          },
        },
        {
          $project: {
            name: 1,
            slug: 1,
            total: 1,
            completed: 1,
            pct: {
              $cond: [
                { $eq: ["$total", 0] },
                0,
                { $multiply: [{ $divide: ["$completed", "$total"] }, 100] },
              ],
            },
          },
        },
        { $sort: { pct: -1 } },
        { $limit: 10 },
      ]),
    ]);

    // merge raw per-day counts into a dense zero-filled series
    const dense = buildEmptySeries(days);
    const lookup = Object.fromEntries(
      perDayRaw.map((d) => [d._id, d.count]),
    );
    for (const row of dense) row.count = lookup[row.date] || 0;

    // Top performing teams: rank by completed tasks across all team projects
    const topTeams = await TaskModel.aggregate([
      { $match: { status: "completed" } },
      {
        $lookup: {
          from: "projects",
          localField: "project",
          foreignField: "_id",
          as: "project",
        },
      },
      { $unwind: { path: "$project", preserveNullAndEmptyArrays: false } },
      {
        $group: {
          _id: "$project.team",
          completed: { $sum: 1 },
        },
      },
      { $sort: { completed: -1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: "teams",
          localField: "_id",
          foreignField: "_id",
          as: "team",
        },
      },
      { $unwind: { path: "$team", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 1,
          completed: 1,
          name: "$team.name",
          slug: "$team.slug",
        },
      },
    ]);

    return {
      totals: {
        users: totalUsers,
        teams: totalTeams,
        projects: totalProjects,
        tasks: totalTasks,
        completed: completedTasks,
        overdue: overdueTasks,
      },
      byPriority: byPriority.map((r) => ({ priority: r._id, count: r.count })),
      byStatus: byStatus.map((r) => ({ status: r._id, count: r.count })),
      tasksPerDay: dense,
      topUsers,
      topTeams,
      projectCompletion,
    };
  });

// ---------- User (me) ----------

export const userOverview = async (userId, range = "7d") =>
  cached(`analytics:user:${userId}:${range}`, CACHE_TTL, async () => {
    const { start, days } = rangeStart(range);
    const now = new Date();
    const weekEnd = new Date();
    weekEnd.setUTCHours(23, 59, 59, 999);
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);

    const [
      assigned,
      completed,
      overdue,
      completedPerDayRaw,
      upcomingWeek,
      workloadHours,
      weekTasksRaw,
    ] = await Promise.all([
      TaskModel.countDocuments({ assignees: userId }),
      TaskModel.countDocuments({ assignees: userId, status: "completed" }),
      TaskModel.countDocuments({
        assignees: userId,
        dueDate: { $lt: now },
        status: { $nin: ["completed", "archived"] },
      }),
      TaskModel.aggregate([
        {
          $match: {
            assignees: userId,
            status: "completed",
            completionDate: { $gte: start },
          },
        },
        {
          $group: {
            _id: {
              $dateToString: { format: "%Y-%m-%d", date: "$completionDate" },
            },
            count: { $sum: 1 },
          },
        },
      ]),
      TaskModel.countDocuments({
        assignees: userId,
        dueDate: { $gte: now, $lt: weekEnd },
        status: { $nin: ["completed", "archived"] },
      }),
      TaskModel.aggregate([
        {
          $match: {
            assignees: userId,
            status: { $nin: ["completed", "archived"] },
          },
        },
        { $group: { _id: null, total: { $sum: "$estimatedHours" } } },
      ]),
      // Tasks the user owns that are due in the next 7 days — used for the
      // interactive list + per-day hours bar chart on the dashboard.
      TaskModel.find({
        assignees: userId,
        dueDate: { $gte: now, $lt: weekEnd },
        status: { $nin: ["completed", "archived"] },
      })
        .sort({ dueDate: 1, priority: 1 })
        .limit(20)
        .select("_id title status priority dueDate estimatedHours project")
        .populate("project", "name slug"),
    ]);

    const dense = buildEmptySeries(days);
    const lookup = Object.fromEntries(
      completedPerDayRaw.map((d) => [d._id, d.count]),
    );
    for (const row of dense) row.count = lookup[row.date] || 0;

    // Build a 7-day dense series of estimated hours per day, keyed off
    // dueDate. Tasks without estimatedHours count as 0 hours but still appear
    // in the count.
    const hoursByDay = [];
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setUTCDate(d.getUTCDate() + i);
      hoursByDay.push({
        date: d.toISOString().slice(0, 10),
        hours: 0,
        count: 0,
      });
    }
    const indexByDate = Object.fromEntries(
      hoursByDay.map((row, i) => [row.date, i]),
    );
    for (const t of weekTasksRaw) {
      if (!t.dueDate) continue;
      const key = new Date(t.dueDate).toISOString().slice(0, 10);
      const i = indexByDate[key];
      if (i == null) continue;
      hoursByDay[i].hours += t.estimatedHours || 0;
      hoursByDay[i].count += 1;
    }

    return {
      totals: {
        assigned,
        completed,
        overdue,
        upcomingWeek,
        estimatedWorkloadHours: workloadHours[0]?.total || 0,
      },
      completedPerDay: dense,
      weekTasks: weekTasksRaw,
      hoursByDay,
    };
  });

// ---------- Project ----------

export const projectOverview = async (projectId) =>
  cached(`analytics:project:${projectId}`, CACHE_TTL, async () => {
    const [byStatus, velocity, avgCycleTime] = await Promise.all([
      TaskModel.aggregate([
        { $match: { project: projectId } },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
      TaskModel.aggregate([
        { $match: { project: projectId, status: "completed" } },
        {
          $group: {
            _id: {
              $dateToString: { format: "%Y-%m-%d", date: "$completionDate" },
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
        { $limit: 30 },
      ]),
      TaskModel.aggregate([
        {
          $match: {
            project: projectId,
            status: "completed",
            completionDate: { $exists: true },
            createdAt: { $exists: true },
          },
        },
        {
          $project: {
            cycleMs: { $subtract: ["$completionDate", "$createdAt"] },
          },
        },
        { $group: { _id: null, avgMs: { $avg: "$cycleMs" } } },
      ]),
    ]);

    return {
      byStatus: byStatus.map((r) => ({ status: r._id, count: r.count })),
      velocity: velocity.map((v) => ({ date: v._id, count: v.count })),
      avgCycleDays: avgCycleTime[0]?.avgMs
        ? Math.round(avgCycleTime[0].avgMs / 86_400_000)
        : 0,
    };
  });

// ---------- Recent activity feed for admin dashboard ----------
export const recentActivity = async (limit = 20) =>
  ActivityModel.find()
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate("actor", "name email avatar");

// ---------- Granular endpoints (spec aliases) ----------

export const completedPerWeek = async () => {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - 8 * 7); // last 8 weeks

  const rows = await TaskModel.aggregate([
    {
      $match: {
        status: "completed",
        completionDate: { $gte: start },
      },
    },
    {
      $group: {
        _id: {
          $dateToString: {
            format: "%G-W%V", // ISO week
            date: "$completionDate",
          },
        },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  return { series: rows.map((r) => ({ week: r._id, count: r.count })) };
};

export const overdueTasks = async () => {
  const now = new Date();
  const items = await TaskModel.find({
    dueDate: { $lt: now },
    status: { $nin: ["completed", "archived"] },
  })
    .sort({ dueDate: 1 })
    .limit(100)
    .populate("assignees", "name email avatar")
    .populate("project", "name slug");
  return { count: items.length, items };
};

export const allProjectProgress = async () => {
  const projects = await ProjectModel.aggregate([
    {
      $lookup: {
        from: "tasks",
        localField: "_id",
        foreignField: "project",
        as: "tasks",
      },
    },
    {
      $project: {
        name: 1,
        slug: 1,
        total: { $size: "$tasks" },
        completed: {
          $size: {
            $filter: {
              input: "$tasks",
              as: "t",
              cond: { $eq: ["$$t.status", "completed"] },
            },
          },
        },
      },
    },
    {
      $addFields: {
        completionRate: {
          $cond: [
            { $gt: ["$total", 0] },
            { $round: [{ $multiply: [{ $divide: ["$completed", "$total"] }, 100] }, 0] },
            0,
          ],
        },
      },
    },
    { $sort: { completionRate: -1 } },
  ]);
  return { projects };
};
