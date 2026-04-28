import mongoose from "mongoose";

export const PROJECT_STATUSES = ["active", "on_hold", "archived"];

const projectSchema = new mongoose.Schema(
  {
    team: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Team",
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true, maxlength: 160 },
    slug: { type: String, required: true, lowercase: true, trim: true },
    description: { type: String, default: "", maxlength: 2000 },
    status: { type: String, enum: PROJECT_STATUSES, default: "active" },
    startDate: { type: Date },
    dueDate: { type: Date },
    members: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true },
);

projectSchema.index({ team: 1, slug: 1 }, { unique: true });
projectSchema.index({ members: 1 });

const ProjectModel =
  mongoose.models.Project || mongoose.model("Project", projectSchema);

export default ProjectModel;
