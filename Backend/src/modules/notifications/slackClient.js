import env from "../../config/env.js";
import logger from "../../config/logger.js";

export const slackEnabled = !!env.SLACK_WEBHOOK_URL;

if (slackEnabled) {
  logger.info("Slack notifications enabled");
} else {
  logger.warn(
    "Slack notifications disabled (SLACK_WEBHOOK_URL missing) — slack channel skipped",
  );
}

/**
 * Post a simple message to the configured Slack incoming webhook.
 * Best-effort; errors are logged but never thrown.
 */
export const sendSlackMessage = async ({ title, body, link }) => {
  if (!slackEnabled) return false;
  try {
    const text = link
      ? `*${title}*\n${body || ""}\n<${link}|Open task>`
      : `*${title}*\n${body || ""}`;
    const res = await fetch(env.SLACK_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) {
      logger.warn(`Slack post failed: ${res.status}`);
      return false;
    }
    return true;
  } catch (err) {
    logger.warn(`Slack post error: ${err.message}`);
    return false;
  }
};
