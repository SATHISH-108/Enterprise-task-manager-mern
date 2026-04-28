/**
 * Due-date scanner.
 *
 * Periodically scans active tasks and fires `task_due_soon` and `task_overdue`
 * notifications via the existing `notifications/service.dispatch()` pipeline
 * (which fans them out to in-app + email + push + slack as configured).
 *
 * Idempotency:
 *   - "Due soon" pings fire at most once per task per dueDate-day. Key:
 *       notif:duesoon:<taskId>:<YYYY-MM-DD of dueDate>   TTL 48h
 *   - "Overdue" pings fire at most once per task per calendar day. Key:
 *       notif:overdue:<taskId>:<YYYY-MM-DD today>         TTL 36h
 *   Both keys use Redis SET NX so a restart can't re-spam users, and a task
 *   that stays overdue across days will get exactly one daily reminder.
 *
 * Distributed lock:
 *   notif:scanner:lock  TTL ~55 min (slightly under the tick interval).
 *   If two backend instances tick at the same moment, only one runs the scan.
 *
 * Disable for tests / single-shot scripts via DUE_DATE_SCANNER_ENABLED=false.
 */

import TaskModel from "../modules/tasks/task.model.js";
import * as notif from "../modules/notifications/service.js";
import { redis } from "../config/redis.js";
import logger from "../config/logger.js";
import env from "../config/env.js";

const TICK_MS = 60 * 60 * 1000; // 1 hour
const LOCK_TTL_SECONDS = 55 * 60; // 55 min — never overlap with the next tick
const DUE_SOON_WINDOW_MS = 24 * 60 * 60 * 1000; // 24h ahead
const SOON_KEY_TTL_SECONDS = 48 * 60 * 60; // 48h
const OVERDUE_KEY_TTL_SECONDS = 36 * 60 * 60; // 36h

const SCANNER_LOCK_KEY = "notif:scanner:lock";

const dayKey = (d) => new Date(d).toISOString().slice(0, 10);

// SET NX wrapper that returns true when the key was newly created.
const tryClaim = async (key, ttlSeconds) => {
  try {
    const res = await redis.set(key, "1", "EX", ttlSeconds, "NX");
    return res === "OK";
  } catch (e) {
    logger.warn(`scanner: redis claim failed for ${key}: ${e.message}`);
    return false;
  }
};

const collectRecipients = (task) => {
  const set = new Set();
  for (const a of task.assignees || []) set.add(String(a._id || a));
  for (const w of task.watchers || []) set.add(String(w._id || w));
  if (task.reporter) set.add(String(task.reporter._id || task.reporter));
  return [...set];
};

const hoursUntil = (dueDate) =>
  Math.max(0, Math.round((new Date(dueDate).getTime() - Date.now()) / 3_600_000));

const daysSince = (dueDate) =>
  Math.max(
    0,
    Math.round((Date.now() - new Date(dueDate).getTime()) / 86_400_000),
  );

const dueSoonBody = (dueDate) => {
  const h = hoursUntil(dueDate);
  if (h <= 1) return "Due in less than an hour.";
  if (h < 24) return `Due in ~${h} hour${h === 1 ? "" : "s"}.`;
  return "Due within 24 hours.";
};

const overdueBody = (dueDate) => {
  const d = daysSince(dueDate);
  if (d === 0) return "This task is past its due time.";
  return `Overdue by ${d} day${d === 1 ? "" : "s"}.`;
};

const dispatchToRecipients = (task, type, title, body) => {
  const link = `/tasks/${task._id}`;
  const meta = {
    taskId: String(task._id),
    projectId: task.project ? String(task.project) : null,
    taskTitle: task.title,
    dueDate: task.dueDate,
  };
  for (const userId of collectRecipients(task)) {
    notif.dispatch({ userId, type, title, body, link, meta });
  }
};

const scanDueSoon = async () => {
  const now = Date.now();
  const upper = new Date(now + DUE_SOON_WINDOW_MS);
  const lower = new Date(now);

  const tasks = await TaskModel.find({
    dueDate: { $gte: lower, $lte: upper },
    status: { $nin: ["completed", "archived"] },
  })
    .select("_id title dueDate assignees reporter watchers project")
    .lean();

  let fired = 0;
  for (const task of tasks) {
    const key = `notif:duesoon:${task._id}:${dayKey(task.dueDate)}`;
    const claimed = await tryClaim(key, SOON_KEY_TTL_SECONDS);
    if (!claimed) continue;
    dispatchToRecipients(
      task,
      "task_due_soon",
      `Due soon: ${task.title}`,
      dueSoonBody(task.dueDate),
    );
    fired += 1;
  }
  return fired;
};

const scanOverdue = async () => {
  const now = new Date();
  const todayKey = dayKey(now);

  const tasks = await TaskModel.find({
    dueDate: { $lt: now },
    status: { $nin: ["completed", "archived"] },
  })
    .select("_id title dueDate assignees reporter watchers project")
    .lean();

  let fired = 0;
  for (const task of tasks) {
    const key = `notif:overdue:${task._id}:${todayKey}`;
    const claimed = await tryClaim(key, OVERDUE_KEY_TTL_SECONDS);
    if (!claimed) continue;
    dispatchToRecipients(
      task,
      "task_overdue",
      `Overdue: ${task.title}`,
      overdueBody(task.dueDate),
    );
    fired += 1;
  }
  return fired;
};

export const runOnce = async () => {
  // Distributed lock — first instance to claim wins this tick.
  const claimed = await tryClaim(SCANNER_LOCK_KEY, LOCK_TTL_SECONDS);
  if (!claimed) {
    logger.debug?.("scanner: another instance holds the lock, skipping tick");
    return { skipped: true };
  }
  try {
    const [soon, overdue] = await Promise.all([scanDueSoon(), scanOverdue()]);
    if (soon + overdue > 0) {
      logger.info(
        `scanner: dispatched ${soon} due-soon + ${overdue} overdue notifications`,
      );
    }
    return { skipped: false, dueSoon: soon, overdue };
  } catch (e) {
    logger.error(`scanner: tick failed: ${e.message}`);
    return { skipped: false, error: e.message };
  }
};

let timer = null;

export const startScanner = ({ runImmediately = false } = {}) => {
  if (env.DUE_DATE_SCANNER_ENABLED === false) {
    logger.info("Due-date scanner disabled via env");
    return;
  }
  if (timer) return; // already running
  logger.info(`Due-date scanner starting (every ${TICK_MS / 60_000} min)`);
  if (runImmediately) {
    runOnce().catch((e) => logger.error(`scanner first-tick: ${e.message}`));
  }
  timer = setInterval(() => {
    runOnce().catch((e) => logger.error(`scanner tick: ${e.message}`));
  }, TICK_MS);
  // Don't keep the process alive solely for this timer — graceful shutdown
  // shouldn't hang waiting for the next tick.
  if (typeof timer.unref === "function") timer.unref();
};

export const stopScanner = () => {
  if (timer) {
    clearInterval(timer);
    timer = null;
    logger.info("Due-date scanner stopped");
  }
};
