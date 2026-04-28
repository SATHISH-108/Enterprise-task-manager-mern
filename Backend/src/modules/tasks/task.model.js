import mongoose from "mongoose";

export const TASK_STATUSES = [
  "backlog",
  "todo",
  "in_progress",
  "in_review",
  "blocked",
  "completed",
  "archived",
];
export const TASK_PRIORITIES = ["low", "medium", "high", "urgent"];

const attachmentEmbedded = new mongoose.Schema(
  {
    url: { type: String, required: true },
    publicId: { type: String },
    mime: { type: String },
    size: { type: Number },
    name: { type: String },
    uploader: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: true },
);

const aiMetaSchema = new mongoose.Schema(
  {
    autoDescription: { type: String },
    subtaskSuggestions: { type: [String], default: [] },
    suggestedPriority: { type: String },
    delayRisk: {
      score: { type: Number },
      label: { type: String, enum: ["low", "medium", "high"] },
      scoredAt: { type: Date },
    },
  },
  { _id: false },
);

/**
 * V2 Task schema. V1 cleanup is complete (cleanV1TaskFields.js drops the
 * legacy `assignedTo` / `difficulty` columns); a project reference is now
 * mandatory — every task lives inside exactly one project.
 */
const taskSchema = new mongoose.Schema(
  {
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      index: true,
    },
    title: { type: String, required: true, trim: true, maxlength: 300 },
    description: { type: String, default: "", maxlength: 20000 },

    status: {
      type: String,
      enum: TASK_STATUSES,
      default: "todo",
      index: true,
    },
    priority: {
      type: String,
      enum: TASK_PRIORITIES,
      default: "medium",
      index: true,
    },

    assignees: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    reporter: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    watchers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],

    startDate: { type: Date },
    dueDate: { type: Date, index: true },
    completionDate: { type: Date },

    estimatedHours: { type: Number, default: 0, min: 0 },
    actualHours: { type: Number, default: 0, min: 0 },

    dependencies: [{ type: mongoose.Schema.Types.ObjectId, ref: "Task" }],
    parent: { type: mongoose.Schema.Types.ObjectId, ref: "Task", index: true },
    milestone: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Milestone",
      index: true,
    },

    tags: [{ type: String, trim: true, maxlength: 40 }],
    attachments: { type: [attachmentEmbedded], default: [] },

    aiMeta: { type: aiMetaSchema, default: () => ({}) },

    position: { type: Number, default: 0, index: true },

    // Time tracking — embedded entries. A user has at most one running entry
    // (no `endedAt`) per task at any time. On stop, hours is computed and
    // added to `actualHours`.
    timeEntries: {
      type: [
        new mongoose.Schema(
          {
            user: {
              type: mongoose.Schema.Types.ObjectId,
              ref: "User",
              required: true,
            },
            startedAt: { type: Date, required: true },
            endedAt: { type: Date },
            hours: { type: Number, default: 0 },
            note: { type: String, maxlength: 200 },
          },
          { _id: true, timestamps: false },
        ),
      ],
      default: [],
    },
  },
  { timestamps: true },
);

taskSchema.index({ project: 1, status: 1, position: 1 });
taskSchema.index({ assignees: 1, status: 1 });

const TaskModel = mongoose.models.Task || mongoose.model("Task", taskSchema);

export default TaskModel;
