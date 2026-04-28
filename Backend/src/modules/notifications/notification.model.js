import mongoose from "mongoose";

export const NOTIFICATION_TYPES = [
  "task_assigned",
  "task_status_changed",
  "task_commented",
  "task_mentioned",
  "task_due_soon",
  "task_overdue",
  "project_invite",
  "team_invite",
  "system",
];

export const DELIVERY_CHANNELS = ["in_app", "email", "push", "slack"];

const notificationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    type: { type: String, enum: NOTIFICATION_TYPES, required: true },
    title: { type: String, required: true, maxlength: 200 },
    body: { type: String, default: "", maxlength: 1000 },
    link: { type: String },
    read: { type: Boolean, default: false, index: true },
    readAt: { type: Date },
    deliveredChannels: [{ type: String, enum: DELIVERY_CHANNELS }],
    meta: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

notificationSchema.index({ user: 1, read: 1, createdAt: -1 });

const NotificationModel =
  mongoose.models.Notification ||
  mongoose.model("Notification", notificationSchema);

export default NotificationModel;
