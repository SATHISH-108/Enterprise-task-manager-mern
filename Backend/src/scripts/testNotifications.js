/**
 * End-to-end notification smoke test.
 *
 * Spins up against your real Mongo + Redis (uses Backend/.env), creates a
 * temp task with one assignee that is NOT the actor, and verifies a
 * Notification document was written for that user with the correct channels.
 *
 * Run from Backend/:
 *   node src/scripts/testNotifications.js <assigneeEmail>
 *
 * Optional flags:
 *   --reporter <email>   email of the actor (defaults to first admin found)
 *   --project <id>       project id to use (defaults to any project the actor can see)
 *   --keep                don't delete the test task after running
 */

import "dotenv/config";
import mongoose from "mongoose";
import env from "../config/env.js";
import { dbConnect } from "../config/db.js";
import "../modules/users/user.model.js";
import "../modules/teams/team.model.js";
import "../modules/projects/project.model.js";
import TaskModel from "../modules/tasks/task.model.js";
import NotificationModel from "../modules/notifications/notification.model.js";
import UserModel from "../modules/users/user.model.js";
import ProjectModel from "../modules/projects/project.model.js";
import * as taskSvc from "../modules/tasks/service.js";
import { pushEnabled } from "../modules/notifications/pushClient.js";
import { slackEnabled } from "../modules/notifications/slackClient.js";

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const positional = args.filter((a) => !a.startsWith("--") && !args[args.indexOf(a) - 1]?.startsWith("--"));

const assigneeEmail = positional[0];
if (!assigneeEmail) {
  console.error("Usage: node src/scripts/testNotifications.js <assigneeEmail> [--reporter <email>] [--project <id>] [--keep]");
  process.exit(1);
}

const log = (...a) => console.log("·", ...a);
const ok = (...a) => console.log("✓", ...a);
const fail = (...a) => {
  console.error("✗", ...a);
  process.exit(1);
};

const main = async () => {
  log(`Mongo: ${env.MONGO_URI.split("@").pop().split("?")[0]}`);
  log(`Redis: ${env.REDIS_URL.split("@").pop().split("/")[0]}`);
  log(`Channels enabled: in_app=yes email=${!!env.SMTP_HOST} push=${pushEnabled} slack=${slackEnabled}`);
  console.log();

  await dbConnect();

  const assignee = await UserModel.findOne({ email: assigneeEmail });
  if (!assignee) fail(`No user with email ${assigneeEmail}`);
  ok(`Assignee: ${assignee.name} (${assignee.email}) — role=${assignee.role}`);

  const reporterEmail = flag("reporter");
  const reporter = reporterEmail
    ? await UserModel.findOne({ email: reporterEmail })
    : await UserModel.findOne({ role: "admin" });
  if (!reporter) fail("No reporter — pass --reporter <email> or create an admin");
  if (String(reporter._id) === String(assignee._id))
    fail("Reporter and assignee must be different (notifications skip self)");
  ok(`Reporter: ${reporter.name} (${reporter.email}) — role=${reporter.role}`);

  let projectId = flag("project");
  if (!projectId) {
    const project = await ProjectModel.findOne({
      $or: [{ members: reporter._id }, { createdBy: reporter._id }],
    });
    if (!project) fail("No project visible to reporter — pass --project <id>");
    projectId = String(project._id);
  }
  const project = await ProjectModel.findById(projectId);
  if (!project) fail(`Project ${projectId} not found`);
  ok(`Project: ${project.name}`);

  // ensure assignee is allowed to receive — add to project members if missing
  if (!(project.members || []).map(String).includes(String(assignee._id))) {
    project.members.push(assignee._id);
    await project.save();
    log(`Added assignee to project.members so listTasks scoping passes`);
  }

  // count notifications BEFORE
  const before = await NotificationModel.countDocuments({ user: assignee._id });
  log(`Existing notifications for assignee: ${before}`);

  // CREATE TASK
  console.log();
  log("Creating task with assignee…");
  const t0 = Date.now();
  const task = await taskSvc.createTask(
    { id: String(reporter._id), role: reporter.role },
    {
      project: String(project._id),
      title: `[notif-smoke ${new Date().toISOString().slice(11, 19)}] Test`,
      description: "Automated notification smoke test. Safe to delete.",
      priority: "medium",
      status: "todo",
      assignees: [String(assignee._id)],
    },
  );
  ok(`Task created: ${task._id} (${Date.now() - t0} ms)`);

  // Wait for the async dispatch to flush.
  await new Promise((r) => setTimeout(r, 1500));

  const after = await NotificationModel.findOne({
    user: assignee._id,
    type: "task_assigned",
    "meta.taskId": task._id,
  }).sort({ createdAt: -1 });

  if (!after) {
    fail(
      "No task_assigned notification was written. Check backend logs for `notif dispatch failed` warnings.",
    );
  }

  ok(`Notification written: ${after._id}`);
  ok(`Title: "${after.title}"`);
  ok(`Channels: ${after.deliveredChannels.join(", ")}`);

  // Channel-by-channel verification
  console.log();
  log("Channel verification:");

  const expectInApp = after.deliveredChannels.includes("in_app");
  console.log(`  in_app   ${expectInApp ? "✓ present" : "✗ MISSING"}`);

  const expectEmail = after.deliveredChannels.includes("email");
  if (env.SMTP_HOST) {
    console.log(`  email    ${expectEmail ? "✓ queued (SMTP configured) — check the inbox" : "✗ MISSING"}`);
  } else {
    console.log(`  email    ⚠  SMTP not configured — Ethereal preview URL will appear in backend logs if SMTP_USER blank`);
  }

  if (pushEnabled) {
    console.log(
      `  push     ${
        after.deliveredChannels.includes("push")
          ? "✓ queued — recipient must have an active subscription (bell → Enable)"
          : "✗ MISSING (VAPID is configured, why didn't it fire?)"
      }`,
    );
  } else {
    console.log("  push     ⚠  VAPID keys not set — push channel skipped");
  }

  if (slackEnabled) {
    console.log(
      `  slack    ${
        after.deliveredChannels.includes("slack")
          ? "✓ posted to webhook — check your Slack channel"
          : "⚠  not in channel list (task_assigned is configured for slack — investigate)"
      }`,
    );
  } else {
    console.log("  slack    ⚠  SLACK_WEBHOOK_URL not set — slack channel skipped");
  }

  // Cleanup unless --keep was passed
  if (!args.includes("--keep")) {
    console.log();
    await TaskModel.deleteOne({ _id: task._id });
    await NotificationModel.deleteOne({ _id: after._id });
    log("Cleaned up test task + notification.");
  } else {
    log("Kept test artifacts (--keep). Task id:", String(task._id));
  }

  console.log();
  ok("Notification flow is working end-to-end.");
  await mongoose.disconnect();
  process.exit(0);
};

main().catch(async (e) => {
  console.error("✗ Fatal:", e.message);
  console.error(e.stack);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
