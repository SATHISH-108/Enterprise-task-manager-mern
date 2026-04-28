import mongoose from "mongoose";

const attachmentEmbedded = new mongoose.Schema(
  {
    url: { type: String, required: true },
    publicId: { type: String },
    mime: { type: String },
    size: { type: Number },
    name: { type: String },
  },
  { _id: false },
);

const commentSchema = new mongoose.Schema(
  {
    task: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Task",
      required: true,
      index: true,
    },
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    body: { type: String, required: true, maxlength: 8000 },
    mentions: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    attachments: { type: [attachmentEmbedded], default: [] },
    editedAt: { type: Date },
    // Threaded comments (one-level deep semantics — replies-to-replies
    // collapse to the same parent thread for predictable rendering).
    parent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Comment",
      index: true,
    },
  },
  { timestamps: true },
);

const CommentModel =
  mongoose.models.Comment || mongoose.model("Comment", commentSchema);

export default CommentModel;
