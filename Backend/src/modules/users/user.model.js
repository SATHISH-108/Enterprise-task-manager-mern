import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: {
      type: String,
      unique: true,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    password: { type: String, required: true }, // bcrypt hash
    role: {
      type: String,
      enum: ["admin", "user"],
      default: "user",
      required: true,
    },
    avatar: { type: String, default: "" },

    teams: [{ type: mongoose.Schema.Types.ObjectId, ref: "Team" }],

    resetPasswordTokenHash: { type: String, select: false },
    resetPasswordExpires: { type: Date, select: false },

    failedLoginAttempts: { type: Number, default: 0 },
    lockUntil: { type: Date },

    lastActiveAt: { type: Date },
  },
  { timestamps: true },
);

userSchema.methods.isLocked = function isLocked() {
  return !!(this.lockUntil && this.lockUntil.getTime() > Date.now());
};

userSchema.methods.toSafeJSON = function toSafeJSON() {
  return {
    id: this._id,
    name: this.name,
    email: this.email,
    role: this.role,
    avatar: this.avatar,
    teams: this.teams,
    createdAt: this.createdAt,
  };
};

const UserModel =
  mongoose.models.User || mongoose.model("User", userSchema);

export default UserModel;
