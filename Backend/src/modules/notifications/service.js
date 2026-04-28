import NotificationModel from "./notification.model.js";
import PushSubscriptionModel from "./pushSubscription.model.js";
import UserModel from "../users/user.model.js";
import { redis } from "../../config/redis.js";
import logger from "../../config/logger.js";
import env from "../../config/env.js";
import {
  sendMail,
  assignmentTemplate,
  mentionTemplate,
} from "../../utils/mailer.js";
import { sendPushToUser, pushEnabled } from "./pushClient.js";
import { sendSlackMessage, slackEnabled } from "./slackClient.js";
import { HttpError } from "../../utils/response.js";

const EMAIL_TYPES = new Set([
  "task_assigned",
  "task_mentioned",
  "task_overdue",
  "task_due_soon",
  "project_risk_elevated",
]);

const PUSH_TYPES = new Set([
  "task_assigned",
  "task_mentioned",
  "task_overdue",
  "task_due_soon",
  "task_status_changed",
  "task_commented",
  "project_risk_elevated",
]);

// Slack is broadcast (single channel) — only fire on high-signal events to avoid noise.
const SLACK_TYPES = new Set([
  "task_assigned",
  "task_overdue",
  "task_due_soon",
  "project_risk_elevated",
]);

/**
 * Fire-and-forget notification dispatcher:
 *   1. persist to Mongo (in_app channel)
 *   2. publish to Redis so the socket gateway emits to user's room
 *   3. send email for high-value types (async, errors swallowed)
 */
export const dispatch = async ({
  userId,
  type,
  title,
  body = "",
  link,
  meta,
}) => {
  if (!userId) return null;
  try {
    const channels = ["in_app"];
    if (EMAIL_TYPES.has(type)) channels.push("email");
    if (pushEnabled && PUSH_TYPES.has(type)) channels.push("push");
    if (slackEnabled && SLACK_TYPES.has(type)) channels.push("slack");

    const notif = await NotificationModel.create({
      user: userId,
      type,
      title,
      body,
      link,
      meta,
      deliveredChannels: channels,
    });

    redis
      .publish(
        "notification-events",
        JSON.stringify({
          userId: String(userId),
          notification: notif,
        }),
      )
      .catch((e) => logger.warn(`notif publish failed: ${e.message}`));

    if (EMAIL_TYPES.has(type)) {
      UserModel.findById(userId)
        .select("name email")
        .then((u) => {
          if (!u?.email) return;
          const url = link ? `${env.APP_URL}${link}` : env.APP_URL;
          const tpl =
            type === "task_mentioned"
              ? mentionTemplate(u.name, meta?.taskTitle || title, "Teammate", url)
              : assignmentTemplate(u.name, meta?.taskTitle || title, url);
          return sendMail({ to: u.email, ...tpl });
        })
        .catch((e) => logger.warn(`notif email failed: ${e.message}`));
    }

    if (pushEnabled && PUSH_TYPES.has(type)) {
      sendPushToUser(userId, {
        title,
        body,
        link: link ? `${env.APP_URL}${link}` : env.APP_URL,
        type,
      }).catch((e) => logger.warn(`notif push failed: ${e.message}`));
    }

    if (slackEnabled && SLACK_TYPES.has(type)) {
      sendSlackMessage({
        title,
        body,
        link: link ? `${env.APP_URL}${link}` : env.APP_URL,
      }).catch((e) => logger.warn(`notif slack failed: ${e.message}`));
    }

    return notif;
  } catch (e) {
    logger.error(`notif dispatch failed: ${e.message}`);
    return null;
  }
};

export const listForUser = async (userId, { page = 1, limit = 25, unread } = {}) => {
  const query = { user: userId };
  if (unread === true) query.read = false;

  const skip = (page - 1) * limit;
  const [items, total, unreadCount] = await Promise.all([
    NotificationModel.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    NotificationModel.countDocuments(query),
    NotificationModel.countDocuments({ user: userId, read: false }),
  ]);

  return {
    items,
    total,
    unreadCount,
    page,
    pages: Math.max(1, Math.ceil(total / limit)),
  };
};

export const unreadCount = (userId) =>
  NotificationModel.countDocuments({ user: userId, read: false });

export const markRead = async (userId, id) => {
  const notif = await NotificationModel.findOneAndUpdate(
    { _id: id, user: userId },
    { read: true, readAt: new Date() },
    { returnDocument: "after" },
  );
  if (!notif) throw new HttpError(404, "Notification not found");
  return notif;
};

export const markAllRead = async (userId) => {
  await NotificationModel.updateMany(
    { user: userId, read: false },
    { read: true, readAt: new Date() },
  );
};

// ---- Push subscriptions ----

export const savePushSubscription = async (userId, sub, userAgent = "") => {
  if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
    throw new HttpError(400, "Invalid push subscription payload");
  }
  return PushSubscriptionModel.findOneAndUpdate(
    { endpoint: sub.endpoint },
    {
      user: userId,
      endpoint: sub.endpoint,
      keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
      userAgent,
    },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
  );
};

export const removePushSubscription = async (userId, endpoint) => {
  if (!endpoint) throw new HttpError(400, "endpoint required");
  await PushSubscriptionModel.deleteOne({ user: userId, endpoint });
};
