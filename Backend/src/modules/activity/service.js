import ActivityModel from "./activity.model.js";
import TaskModel from "../tasks/task.model.js";
import ProjectModel from "../projects/project.model.js";
import { assertProjectMember } from "../projects/service.js";
import { HttpError } from "../../utils/response.js";

export const listForTask = async (taskId, user, { page = 1, limit = 50 }) => {
  const task = await TaskModel.findById(taskId).select("project");
  if (!task) throw new HttpError(404, "Task not found");
  await assertProjectMember(task.project, user);

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    ActivityModel.find({ scope: "task", refId: taskId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("actor", "name email avatar"),
    ActivityModel.countDocuments({ scope: "task", refId: taskId }),
  ]);
  return { items, total, page, pages: Math.max(1, Math.ceil(total / limit)) };
};

export const listForProject = async (projectId, user, { page = 1, limit = 50 }) => {
  const project = await ProjectModel.findById(projectId).select("_id");
  if (!project) throw new HttpError(404, "Project not found");
  await assertProjectMember(project._id, user);

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    ActivityModel.find({ scope: "project", refId: projectId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("actor", "name email avatar"),
    ActivityModel.countDocuments({ scope: "project", refId: projectId }),
  ]);
  return { items, total, page, pages: Math.max(1, Math.ceil(total / limit)) };
};
