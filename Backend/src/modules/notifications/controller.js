import { z } from "zod";
import * as svc from "./service.js";
import { ok, asyncHandler } from "../../utils/response.js";
import { vapidPublicKey, pushEnabled } from "./pushClient.js";

const listSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(25),
  unread: z
    .union([z.literal("true"), z.literal("false"), z.boolean()])
    .optional()
    .transform((v) => (v === true || v === "true" ? true : undefined)),
});

export const list = asyncHandler(async (req, res) => {
  const q = listSchema.parse(req.query);
  const result = await svc.listForUser(req.user.id, q);
  return ok(res, result);
});

export const unread = asyncHandler(async (req, res) => {
  const count = await svc.unreadCount(req.user.id);
  return ok(res, { count });
});

export const read = asyncHandler(async (req, res) => {
  const notif = await svc.markRead(req.user.id, req.params.id);
  return ok(res, { notification: notif });
});

export const readAll = asyncHandler(async (req, res) => {
  await svc.markAllRead(req.user.id);
  return ok(res, {}, "All notifications marked as read");
});

export const pushKey = asyncHandler(async (_req, res) =>
  ok(res, { publicKey: vapidPublicKey(), enabled: pushEnabled }),
);

const subscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

export const pushSubscribe = asyncHandler(async (req, res) => {
  const sub = subscribeSchema.parse(req.body);
  const ua = req.headers["user-agent"] || "";
  const saved = await svc.savePushSubscription(req.user.id, sub, ua);
  return ok(res, { subscription: saved }, "Push subscription saved");
});

const unsubscribeSchema = z.object({ endpoint: z.string().url() });

export const pushUnsubscribe = asyncHandler(async (req, res) => {
  const { endpoint } = unsubscribeSchema.parse(req.body);
  await svc.removePushSubscription(req.user.id, endpoint);
  return ok(res, {}, "Push subscription removed");
});
