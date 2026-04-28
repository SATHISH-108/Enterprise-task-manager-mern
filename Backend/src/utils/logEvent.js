import ActivityModel from "../modules/activity/activity.model.js";
import logger from "../config/logger.js";
import { redis } from "../config/redis.js";

/**
 * Central activity writer. Writes to Activity collection + publishes to Redis
 * so any subscriber (notification dispatcher, socket gateway) can react.
 *
 * @param {object} params
 * @param {"task"|"project"|"team"|"user"} params.scope
 * @param {string|ObjectId} params.refId
 * @param {string|ObjectId} params.actor
 * @param {string} params.type - created|updated|status_change|assigned|commented|mentioned|attached|completed|reopened
 * @param {object} [params.before]
 * @param {object} [params.after]
 * @param {string} [params.message]
 * @param {object} [params.meta]
 */
export const logEvent = async ({
  scope,
  refId,
  actor,
  type,
  before,
  after,
  message,
  meta,
}) => {
  try {
    const entry = await ActivityModel.create({
      scope,
      refId,
      actor,
      type,
      before,
      after,
      message,
      meta,
    });
    redis
      .publish("activity-events", JSON.stringify(entry))
      .catch((e) => logger.warn(`activity publish failed: ${e.message}`));
    return entry;
  } catch (err) {
    logger.error(`logEvent failed: ${err.message}`);
    return null;
  }
};

export default logEvent;
