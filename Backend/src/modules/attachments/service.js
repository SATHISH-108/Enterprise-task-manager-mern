import { Readable } from "node:stream";
import TaskModel from "../tasks/task.model.js";
import { assertProjectMember } from "../projects/service.js";
import cloudinary, { cloudinaryEnabled } from "../../config/cloudinary.js";
import { HttpError } from "../../utils/response.js";
import logEvent from "../../utils/logEvent.js";

const streamToCloudinary = (buffer, { folder, resourceType = "auto", filename }) =>
  new Promise((resolve, reject) => {
    const upload = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: resourceType,
        public_id: filename ? filename.replace(/\.[^.]+$/, "") : undefined,
      },
      (err, result) => (err ? reject(err) : resolve(result)),
    );
    Readable.from(buffer).pipe(upload);
  });

export const addAttachment = async (taskId, user, file) => {
  if (!cloudinaryEnabled)
    throw new HttpError(
      503,
      "File uploads disabled — CLOUDINARY_* env vars not set",
    );

  const task = await TaskModel.findById(taskId);
  if (!task) throw new HttpError(404, "Task not found");
  await assertProjectMember(task.project, user);

  const result = await streamToCloudinary(file.buffer, {
    folder: `tasks/${task._id}`,
    filename: file.originalname,
  });

  const attachment = {
    url: result.secure_url,
    publicId: result.public_id,
    mime: file.mimetype,
    size: file.size,
    name: file.originalname,
    uploader: user.id,
  };

  task.attachments.push(attachment);
  await task.save();

  logEvent({
    scope: "task",
    refId: task._id,
    actor: user.id,
    type: "attached",
    message: `attached ${file.originalname}`,
    meta: { projectId: String(task.project), attachment },
  });

  return task.attachments[task.attachments.length - 1];
};

/**
 * Batch upload — all files uploaded to Cloudinary in parallel and persisted
 * to the task in a single save. Either every file lands or none do (the
 * Cloudinary uploads themselves can't be transactionally rolled back if some
 * succeed and some fail; on partial failure we throw, but the partially
 * uploaded blobs remain in Cloudinary as orphans). For typical demo
 * workloads (5-10 small files) this is the right tradeoff for speed.
 */
export const addAttachments = async (taskId, user, files) => {
  if (!cloudinaryEnabled)
    throw new HttpError(
      503,
      "File uploads disabled — CLOUDINARY_* env vars not set",
    );
  if (!Array.isArray(files) || files.length === 0) {
    throw new HttpError(400, "No files uploaded");
  }

  const task = await TaskModel.findById(taskId);
  if (!task) throw new HttpError(404, "Task not found");
  await assertProjectMember(task.project, user);

  // Parallel Cloudinary uploads — slow files don't block fast ones.
  const results = await Promise.all(
    files.map((file) =>
      streamToCloudinary(file.buffer, {
        folder: `tasks/${task._id}`,
        filename: file.originalname,
      }).then((result) => ({ result, file })),
    ),
  );

  const attachments = results.map(({ result, file }) => ({
    url: result.secure_url,
    publicId: result.public_id,
    mime: file.mimetype,
    size: file.size,
    name: file.originalname,
    uploader: user.id,
  }));

  task.attachments.push(...attachments);
  await task.save();

  logEvent({
    scope: "task",
    refId: task._id,
    actor: user.id,
    type: "attached",
    message:
      attachments.length === 1
        ? `attached ${attachments[0].name}`
        : `attached ${attachments.length} files`,
    meta: {
      projectId: String(task.project),
      count: attachments.length,
      names: attachments.map((a) => a.name),
    },
  });

  // Return the freshly persisted entries (with their generated _ids).
  return task.attachments.slice(-attachments.length);
};

export const removeAttachment = async (taskId, attachmentId, user) => {
  const task = await TaskModel.findById(taskId);
  if (!task) throw new HttpError(404, "Task not found");
  await assertProjectMember(task.project, user);

  const att = task.attachments.id(attachmentId);
  if (!att) throw new HttpError(404, "Attachment not found");

  if (att.publicId && cloudinaryEnabled) {
    try {
      await cloudinary.uploader.destroy(att.publicId, { resource_type: "auto" });
    } catch {
      /* non-fatal */
    }
  }

  att.deleteOne();
  await task.save();

  logEvent({
    scope: "task",
    refId: task._id,
    actor: user.id,
    type: "updated",
    message: `removed attachment ${att.name}`,
    meta: { projectId: String(task.project) },
  });

  return task;
};
