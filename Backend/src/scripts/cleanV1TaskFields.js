/**
 * One-shot migration: drop V1 task shims (`assignedTo`, `difficulty`) from
 * every existing task document, and report any task missing a `project`
 * (which would now fail the schema's required: true validator on save).
 *
 * Idempotent. Safe to run multiple times.
 *
 * Usage:
 *   cd Backend
 *   node src/scripts/cleanV1TaskFields.js
 */

import dbConnect from "../config/db.js";
import logger from "../config/logger.js";
import TaskModel from "../modules/tasks/task.model.js";

const run = async () => {
  await dbConnect();

  const orphans = await TaskModel.find({
    $or: [{ project: null }, { project: { $exists: false } }],
  })
    .select("_id title status")
    .lean();

  if (orphans.length) {
    logger.warn(
      `Found ${orphans.length} task(s) with no project — these will FAIL ` +
        `validation on next save. Inspect and decide whether to delete or assign:`,
    );
    for (const t of orphans) {
      logger.warn(`  - ${t._id}  status=${t.status}  title="${t.title}"`);
    }
  } else {
    logger.info("No orphan tasks found (every task has a project).");
  }

  // Drop the V1 columns regardless. Idempotent.
  const result = await TaskModel.updateMany(
    {
      $or: [
        { assignedTo: { $exists: true } },
        { difficulty: { $exists: true } },
      ],
    },
    { $unset: { assignedTo: 1, difficulty: 1 } },
  );

  logger.info(
    `cleanV1TaskFields: ${result.modifiedCount} task document(s) cleaned.`,
  );
  process.exit(0);
};

run().catch((err) => {
  logger.error(`cleanV1TaskFields failed: ${err.message}`);
  process.exit(1);
});
