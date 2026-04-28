/**
 * Idempotent migration: ensures a "Default" workspace exists, attaches every
 * existing team to it (without overwriting teams that already have a workspace
 * ref), and adds every team's members to the workspace's member list so basic
 * scoping queries don't lose people.
 *
 * Safe to run multiple times. Run after `npm install`:
 *   node src/scripts/createDefaultWorkspace.js
 */

import dbConnect from "../config/db.js";
import logger from "../config/logger.js";
import WorkspaceModel from "../modules/workspaces/workspace.model.js";
import TeamModel from "../modules/teams/team.model.js";
import UserModel from "../modules/users/user.model.js";
import { slugify } from "../utils/slugify.js";

const DEFAULT_NAME = "Default";

const run = async () => {
  await dbConnect();

  // Pick a system admin as the workspace's createdBy / first owner. Falls
  // back to the first user in the DB if no admin yet (fresh install).
  const owner =
    (await UserModel.findOne({ role: "admin" }).select("_id")) ||
    (await UserModel.findOne().select("_id"));
  if (!owner) {
    logger.warn("createDefaultWorkspace: no users in DB; skipping. Run again after first signup.");
    process.exit(0);
  }

  let ws = await WorkspaceModel.findOne({ slug: slugify(DEFAULT_NAME) });
  if (!ws) {
    ws = await WorkspaceModel.create({
      name: DEFAULT_NAME,
      slug: slugify(DEFAULT_NAME),
      description: "Auto-created during workspace migration. Holds every team that existed before workspaces shipped.",
      owners: [owner._id],
      members: [owner._id],
      createdBy: owner._id,
    });
    logger.info(`Created Default workspace ${ws._id}`);
  } else {
    logger.info(`Default workspace already exists (${ws._id}); will only fill in missing team links.`);
  }

  const orphanTeams = await TeamModel.find({
    $or: [{ workspace: null }, { workspace: { $exists: false } }],
  }).select("_id name members lead");

  if (orphanTeams.length === 0) {
    logger.info("No orphan teams found — every team already has a workspace.");
  } else {
    const memberIds = new Set(ws.members.map(String));
    for (const team of orphanTeams) {
      team.workspace = ws._id;
      await team.save();
      for (const m of team.members || []) memberIds.add(String(m));
      if (team.lead) memberIds.add(String(team.lead));
    }
    ws.members = [...memberIds];
    await ws.save();
    logger.info(
      `Attached ${orphanTeams.length} team(s) to Default workspace; total members ${ws.members.length}.`,
    );
  }

  process.exit(0);
};

run().catch((err) => {
  logger.error(`createDefaultWorkspace failed: ${err.message}`);
  process.exit(1);
});
