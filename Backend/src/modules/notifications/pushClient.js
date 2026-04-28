import webpush from "web-push";
import env from "../../config/env.js";
import logger from "../../config/logger.js";
import PushSubscriptionModel from "./pushSubscription.model.js";

export const pushEnabled = !!(
  env.VAPID_PUBLIC_KEY &&
  env.VAPID_PRIVATE_KEY &&
  env.VAPID_CONTACT_EMAIL
);

if (pushEnabled) {
  webpush.setVapidDetails(
    `mailto:${env.VAPID_CONTACT_EMAIL}`,
    env.VAPID_PUBLIC_KEY,
    env.VAPID_PRIVATE_KEY,
  );
  logger.info("Web Push enabled");
} else {
  logger.warn("Web Push disabled (VAPID keys missing) — push channel skipped");
}

/**
 * Send a notification to every registered device for a user. Stale (410/404)
 * subscriptions are pruned so we don't keep retrying dead endpoints.
 */
export const sendPushToUser = async (userId, payload) => {
  if (!pushEnabled) return 0;
  const subs = await PushSubscriptionModel.find({ user: userId });
  if (!subs.length) return 0;

  const body = JSON.stringify(payload);
  let delivered = 0;
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
          },
          body,
        );
        delivered += 1;
      } catch (err) {
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          await PushSubscriptionModel.deleteOne({ _id: sub._id }).catch(() => {});
        } else {
          logger.warn(`push send failed: ${err.message}`);
        }
      }
    }),
  );
  return delivered;
};

export const vapidPublicKey = () => env.VAPID_PUBLIC_KEY || "";
