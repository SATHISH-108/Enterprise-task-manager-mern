import mongoose from "mongoose";

export const ACTIVITY_SCOPES = ["task", "project", "team", "user"];
export const ACTIVITY_TYPES = [
  "created",
  "updated",
  "status_change",
  "assigned",
  "unassigned",
  "commented",
  "mentioned",
  "attached",
  "completed",
  "reopened",
  "deleted",
];

const activitySchema = new mongoose.Schema(
  {
    scope: { type: String, enum: ACTIVITY_SCOPES, required: true },
    refId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    type: { type: String, enum: ACTIVITY_TYPES, required: true },
    before: { type: mongoose.Schema.Types.Mixed },
    after: { type: mongoose.Schema.Types.Mixed },
    message: { type: String },
    meta: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

activitySchema.index({ scope: 1, refId: 1, createdAt: -1 });

const ActivityModel =
  mongoose.models.Activity || mongoose.model("Activity", activitySchema);

export default ActivityModel;
