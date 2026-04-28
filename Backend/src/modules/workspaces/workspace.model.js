import mongoose from "mongoose";

/**
 * Workspace — an additive parent tier above Team. Today it acts as a
 * grouping/categorisation construct (e.g. "Acme Corp" / "Personal Side
 * Projects"), not a hard security boundary — every existing
 * team/project/task RBAC check still applies. The migration script
 * `createDefaultWorkspace.js` ensures every existing Team is owned by
 * a "Default" workspace so legacy data continues to work.
 */
const workspaceSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 160 },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    description: { type: String, default: "", maxlength: 2000 },
    // Workspace-level admins. Distinct from system-level `User.role === "admin"`,
    // which is super-admin. Owners can add/remove teams from this workspace.
    owners: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    members: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true },
);

workspaceSchema.index({ members: 1 });
workspaceSchema.index({ owners: 1 });

const WorkspaceModel =
  mongoose.models.Workspace || mongoose.model("Workspace", workspaceSchema);

export default WorkspaceModel;
