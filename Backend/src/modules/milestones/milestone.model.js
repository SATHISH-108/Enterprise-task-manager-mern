import mongoose from "mongoose";

export const MILESTONE_STATUSES = [
  "upcoming",
  "active",
  "completed",
  "canceled",
];

/**
 * Milestone — a named outcome inside a Project. When `startDate` AND `dueDate`
 * are both set, the frontend treats it as a "sprint" (time-boxed) and renders
 * sprint-style progress. When only `dueDate` is set, it's a plain milestone.
 *
 * Tasks reference a milestone via Task.milestone. Deleting a milestone unsets
 * that field on its tasks (handled in service.js#remove); tasks themselves are
 * never deleted.
 */
const milestoneSchema = new mongoose.Schema(
  {
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, default: "", maxlength: 2000 },
    status: {
      type: String,
      enum: MILESTONE_STATUSES,
      default: "upcoming",
      index: true,
    },
    // When startDate is present, the UI treats this as a sprint (time-boxed).
    startDate: { type: Date },
    dueDate: { type: Date, index: true },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true },
);

milestoneSchema.index({ project: 1, dueDate: 1 });

const MilestoneModel =
  mongoose.models.Milestone || mongoose.model("Milestone", milestoneSchema);

export default MilestoneModel;
