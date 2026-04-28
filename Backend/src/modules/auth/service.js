import bcrypt from "bcrypt";
import UserModel from "../users/user.model.js";
import env from "../../config/env.js";
import logger from "../../config/logger.js";
import { HttpError } from "../../utils/response.js";
import {
  signAccess,
  signRefresh,
  verifyRefresh,
  storeRefresh,
  getStoredRefresh,
  clearRefresh,
  generateOpaqueToken,
  hashOpaqueToken,
} from "../../utils/token.js";
import { sendMail, resetPasswordTemplate } from "../../utils/mailer.js";

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
const RESET_TTL_MINUTES = 60;

export const registerUser = async ({ name, email, password, role }) => {
  const existing = await UserModel.findOne({ email });
  if (existing) throw new HttpError(409, "Email already in use");

  const hash = await bcrypt.hash(password, 10);

  const user = await UserModel.create({
    name,
    email,
    password: hash,
    role: role === "admin" ? "admin" : "user",
  });

  return user;
};

export const loginUser = async ({ email, password }) => {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const user = await UserModel.findOne({ email: normalizedEmail }).select(
    "+password +failedLoginAttempts +lockUntil",
  );
  if (!user) throw new HttpError(400, "Invalid credentials");

  if (user.isLocked()) {
    const minutes = Math.ceil((user.lockUntil - Date.now()) / 60000);
    throw new HttpError(423, `Account locked. Try again in ${minutes} minutes.`);
  }

  const passwordOk = await bcrypt.compare(password, user.password);
  if (!passwordOk) {
    user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
    if (user.failedLoginAttempts >= MAX_FAILED_ATTEMPTS) {
      user.lockUntil = new Date(Date.now() + LOCK_MINUTES * 60 * 1000);
      user.failedLoginAttempts = 0;
      await user.save();
      throw new HttpError(
        423,
        `Too many failed attempts. Account locked for ${LOCK_MINUTES} minutes.`,
      );
    }
    await user.save();
    throw new HttpError(400, "Invalid credentials");
  }

  // success — reset counters
  user.failedLoginAttempts = 0;
  user.lockUntil = undefined;
  user.lastActiveAt = new Date();
  await user.save();

  const access = signAccess(user);
  const refresh = signRefresh(user);
  await storeRefresh(user._id.toString(), refresh);

  return { user, access, refresh };
};

export const rotateRefresh = async (presented) => {
  let decoded;
  try {
    decoded = verifyRefresh(presented);
  } catch {
    throw new HttpError(401, "Refresh token invalid");
  }
  const stored = await getStoredRefresh(decoded.id);
  if (!stored || stored !== presented) {
    // stored mismatch implies the token was already rotated or revoked
    await clearRefresh(decoded.id);
    throw new HttpError(401, "Refresh token revoked");
  }
  const user = await UserModel.findById(decoded.id);
  if (!user) throw new HttpError(401, "User not found");

  const access = signAccess(user);
  const refresh = signRefresh(user);
  await storeRefresh(user._id.toString(), refresh);
  return { user, access, refresh };
};

export const logoutUser = async (userId) => {
  if (userId) await clearRefresh(userId);
};

export const forgotPassword = async (email) => {
  // never leak whether the email exists
  const user = await UserModel.findOne({ email });
  if (!user) return;

  const { raw, hash: tokenHash } = generateOpaqueToken();
  user.resetPasswordTokenHash = tokenHash;
  user.resetPasswordExpires = new Date(
    Date.now() + RESET_TTL_MINUTES * 60 * 1000,
  );
  await user.save();

  const resetUrl = `${env.APP_URL}/reset-password?token=${raw}`;
  const tpl = resetPasswordTemplate(user.name, resetUrl);
  sendMail({ to: user.email, ...tpl }).catch((e) =>
    logger.warn(`reset email send failed: ${e.message}`),
  );
};

export const resetPassword = async (rawToken, newPassword) => {
  const tokenHash = hashOpaqueToken(rawToken);
  const user = await UserModel.findOne({
    resetPasswordTokenHash: tokenHash,
    resetPasswordExpires: { $gt: new Date() },
  }).select("+resetPasswordTokenHash +resetPasswordExpires +password");
  if (!user) throw new HttpError(400, "Reset token invalid or expired");

  user.password = await bcrypt.hash(newPassword, 10);
  user.resetPasswordTokenHash = undefined;
  user.resetPasswordExpires = undefined;
  user.failedLoginAttempts = 0;
  user.lockUntil = undefined;
  await user.save();

  // revoke any active refresh token so all sessions log out
  await clearRefresh(user._id.toString());

  return user;
};

export const changePassword = async (userId, oldPassword, newPassword) => {
  const user = await UserModel.findById(userId).select("+password");
  if (!user) throw new HttpError(404, "User not found");

  const ok = await bcrypt.compare(oldPassword, user.password);
  if (!ok) throw new HttpError(400, "Current password is incorrect");

  user.password = await bcrypt.hash(newPassword, 10);
  await user.save();
  await clearRefresh(user._id.toString());
  return user;
};

export const getMe = async (userId) => {
  const user = await UserModel.findById(userId).populate("teams", "name slug");
  if (!user) throw new HttpError(404, "User not found");
  return user;
};
