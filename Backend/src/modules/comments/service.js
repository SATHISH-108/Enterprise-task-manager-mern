import CommentModel from "./comment.model.js";
import TaskModel from "../tasks/task.model.js";
import UserModel from "../users/user.model.js";
import { assertProjectMember } from "../projects/service.js";
import { HttpError } from "../../utils/response.js";
import logEvent from "../../utils/logEvent.js";
import * as notif from "../notifications/service.js";
import { redis } from "../../config/redis.js";

export const listComments = async (taskId, user, { page = 1, limit = 50 }) => {
  const task = await TaskModel.findById(taskId).select("project");
  if (!task) throw new HttpError(404, "Task not found");
  await assertProjectMember(task.project, user);

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    CommentModel.find({ task: taskId })
      .sort({ createdAt: 1 })
      .skip(skip)
      .limit(limit)
      .populate("author", "name email avatar")
      .populate("mentions", "name email avatar"),
    CommentModel.countDocuments({ task: taskId }),
  ]);

  return { items, total, page, pages: Math.max(1, Math.ceil(total / limit)) };
};

// extract @mentions from body — resolves @name or @email against users in the
// project's team; explicit `mentions` ids passed by the client are merged.
const resolveMentions = async (body, explicit = [], projectId) => {
  const handles = [...body.matchAll(/(?:^|\s)@([A-Za-z0-9._+-]+)/g)].map(
    (m) => m[1].toLowerCase(),
  );
  const ids = new Set(explicit.map(String));
  if (handles.length) {
    const users = await UserModel.find({
      $or: [
        { email: { $in: handles.map((h) => new RegExp(`^${h}`, "i")) } },
        {
          name: {
            $in: handles.map(
              (h) => new RegExp(h.replace(/[-.]/g, "\\s"), "i"),
            ),
          },
        },
      ],
    }).select("_id");
    for (const u of users) ids.add(String(u._id));
  }
  return [...ids];
};

export const addComment = async (taskId, user, { body, mentions = [], parent }) => {
  const task = await TaskModel.findById(taskId);
  if (!task) throw new HttpError(404, "Task not found");
  const project = await assertProjectMember(task.project, user);

  // Threading: validate the parent (if any) belongs to the same task and
  // collapse replies-to-replies to the original root so the tree stays one
  // level deep — keeps rendering predictable and avoids unbounded indents.
  let parentId = null;
  if (parent) {
    const parentDoc = await CommentModel.findById(parent).select("task parent");
    if (!parentDoc) throw new HttpError(404, "Parent comment not found");
    if (String(parentDoc.task) !== String(task._id)) {
      throw new HttpError(400, "Parent comment belongs to a different task");
    }
    parentId = parentDoc.parent
      ? parentDoc.parent // collapse to root
      : parentDoc._id;
  }

  const resolvedMentions = await resolveMentions(body, mentions, task.project);

  const comment = await CommentModel.create({
    task: task._id,
    author: user.id,
    body,
    mentions: resolvedMentions,
    parent: parentId || undefined,
  });

  logEvent({
    scope: "task",
    refId: task._id,
    actor: user.id,
    type: "commented",
    message: body.slice(0, 200),
    meta: {
      projectId: String(task.project),
      commentId: comment._id,
      mentions: resolvedMentions,
    },
  });

  // Emit a separate "mentioned" activity entry per mentioned user so the
  // feed can answer "where was I tagged?" with a single type filter.
  // One per recipient (not one per comment) because the consumer most
  // likely cares about "tasks where my id appears in mention activity".
  for (const mentionedId of resolvedMentions) {
    if (String(mentionedId) === String(user.id)) continue; // self-mention noise
    logEvent({
      scope: "task",
      refId: task._id,
      actor: user.id,
      type: "mentioned",
      message: body.slice(0, 200),
      meta: {
        projectId: String(task.project),
        commentId: comment._id,
        mentionedUser: mentionedId,
      },
    });
  }

  // notify mentioned users + task watchers/reporter/assignees (deduped, excluding self).
  // Also fan out to all admins when the commenter is a regular user, so admins
  // stay aware of any activity on tasks they own.
  let adminIds = [];
  if (user.role !== "admin") {
    const admins = await UserModel.find({ role: "admin" }).select("_id");
    adminIds = admins.map((a) => String(a._id));
  }

  const targets = new Set(
    [
      ...resolvedMentions,
      ...(task.assignees || []).map(String),
      ...(task.watchers || []).map(String),
      String(task.reporter),
      ...adminIds,
    ].filter((u) => u && String(u) !== String(user.id)),
  );

  for (const u of targets) {
    const isMention = resolvedMentions.includes(u);
    notif.dispatch({
      userId: u,
      type: isMention ? "task_mentioned" : "task_commented",
      title: isMention
        ? `You were mentioned on "${task.title}"`
        : `New comment on "${task.title}"`,
      body: body.slice(0, 200),
      link: `/tasks/${task._id}`,
      meta: {
        taskId: task._id,
        projectId: String(task.project),
        commentId: comment._id,
      },
    });
  }

  // emit comment:added via the task-events channel
  redis
    .publish(
      "task-events",
      JSON.stringify({
        type: "comment",
        taskId: String(task._id),
        projectId: String(task.project),
        commentId: String(comment._id),
        author: String(user.id),
      }),
    )
    .catch(() => {});

  return comment.populate("author", "name email avatar");
};

export const editComment = async (id, user, { body }) => {
  const comment = await CommentModel.findById(id);
  if (!comment) throw new HttpError(404, "Comment not found");
  if (user.role !== "admin" && String(comment.author) !== String(user.id))
    throw new HttpError(403, "Cannot edit this comment");
  comment.body = body;
  comment.editedAt = new Date();
  await comment.save();
  return comment;
};

export const deleteComment = async (id, user) => {
  const comment = await CommentModel.findById(id);
  if (!comment) throw new HttpError(404, "Comment not found");
  if (user.role !== "admin" && String(comment.author) !== String(user.id))
    throw new HttpError(403, "Cannot delete this comment");
  await comment.deleteOne();
  return comment;
};
