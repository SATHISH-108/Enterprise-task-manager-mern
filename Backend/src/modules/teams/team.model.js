import mongoose from "mongoose";

const teamSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    description: { type: String, default: "", maxlength: 1000 },
    lead: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    members: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    // Optional parent workspace. Migration script populates this for existing
    // teams; new teams created without an explicit workspace remain top-level.
    workspace: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Workspace",
      index: true,
    },
  },
  { timestamps: true },
);

teamSchema.index({ members: 1 });

const TeamModel =
  mongoose.models.Team || mongoose.model("Team", teamSchema);

export default TeamModel;
