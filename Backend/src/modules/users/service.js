import UserModel from "./user.model.js";
import TaskModel from "../tasks/task.model.js";
import { HttpError } from "../../utils/response.js";
import { escapeRegex } from "../../utils/regex.js";

export const listUsers = async ({ q, team, page = 1, limit = 25 }) => {
  const query = {};
  if (q) {
    const safe = escapeRegex(q);
    query.$or = [
      { name: { $regex: safe, $options: "i" } },
      { email: { $regex: safe, $options: "i" } },
    ];
  }
  if (team) query.teams = team;

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    UserModel.find(query)
      .select("_id name email role avatar teams")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("teams", "name slug"),
    UserModel.countDocuments(query),
  ]);
  return { items, total, page, pages: Math.max(1, Math.ceil(total / limit)) };
};

export const getUserById = async (id) => {
  const user = await UserModel.findById(id)
    .select("_id name email role avatar teams createdAt")
    .populate("teams", "name slug");
  if (!user) throw new HttpError(404, "User not found");
  return user;
};

export const updateMe = async (userId, patch) => {
  const user = await UserModel.findByIdAndUpdate(userId, patch, {
    returnDocument: "after",
    runValidators: true,
  });
  if (!user) throw new HttpError(404, "User not found");
  return user;
};

export const getWorkload = async (userId) => {
  const user = await UserModel.findById(userId).select("_id name email avatar");
  if (!user) throw new HttpError(404, "User not found");

  const since30 = new Date(Date.now() - 30 * 86_400_000);
  const [active, completed30d, overdue, byPriority] = await Promise.all([
    TaskModel.countDocuments({
      assignees: userId,
      status: { $nin: ["completed", "archived"] },
    }),
    TaskModel.countDocuments({
      assignees: userId,
      status: "completed",
      completionDate: { $gte: since30 },
    }),
    TaskModel.countDocuments({
      assignees: userId,
      status: { $nin: ["completed", "archived"] },
      dueDate: { $lt: new Date() },
    }),
    TaskModel.aggregate([
      {
        $match: {
          assignees: user._id,
          status: { $nin: ["completed", "archived"] },
        },
      },
      { $group: { _id: "$priority", count: { $sum: 1 } } },
    ]),
  ]);

  const byPriorityMap = Object.fromEntries(byPriority.map((p) => [p._id, p.count]));

  return {
    user,
    activeTasks: active,
    completedLast30d: completed30d,
    overdue,
    byPriority: {
      low: byPriorityMap.low || 0,
      medium: byPriorityMap.medium || 0,
      high: byPriorityMap.high || 0,
      urgent: byPriorityMap.urgent || 0,
    },
  };
};
