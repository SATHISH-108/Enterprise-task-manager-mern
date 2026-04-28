import {
  registerSchema,
  loginSchema,
  forgotSchema,
  resetSchema,
  changePasswordSchema,
} from "./validators.js";
import * as authService from "./service.js";
import {
  accessCookieOpts,
  refreshCookieOpts,
} from "../../utils/token.js";
import { ok, created, asyncHandler } from "../../utils/response.js";

const setAuthCookies = (res, access, refresh) => {
  res.cookie("accessToken", access, accessCookieOpts);
  res.cookie("refreshToken", refresh, refreshCookieOpts);
};

export const register = asyncHandler(async (req, res) => {
  const data = registerSchema.parse(req.body);
  const user = await authService.registerUser(data);
  return created(res, { user: user.toSafeJSON() }, "Registered");
});

export const login = asyncHandler(async (req, res) => {
  const data = loginSchema.parse(req.body);
  const { user, access, refresh } = await authService.loginUser(data);
  setAuthCookies(res, access, refresh);
  return ok(res, { user: user.toSafeJSON() }, "Logged in");
});

export const refresh = asyncHandler(async (req, res) => {
  const presented = req.cookies?.refreshToken;
  if (!presented) return res.status(401).json({ success: false, message: "No refresh token" });
  const result = await authService.rotateRefresh(presented);
  setAuthCookies(res, result.access, result.refresh);
  return ok(res, { user: result.user.toSafeJSON() });
});

export const logout = asyncHandler(async (req, res) => {
  const userId = req.user?.id;
  await authService.logoutUser(userId);
  res.clearCookie("accessToken", { path: "/" });
  res.clearCookie("refreshToken", { path: "/" });
  return ok(res, {}, "Logged out");
});

export const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = forgotSchema.parse(req.body);
  await authService.forgotPassword(email);
  return ok(
    res,
    {},
    "If an account exists for that email, a reset link has been sent.",
  );
});

export const resetPassword = asyncHandler(async (req, res) => {
  const { token } = req.params;
  const { password } = resetSchema.parse(req.body);
  await authService.resetPassword(token, password);
  return ok(res, {}, "Password updated. Please log in again.");
});

export const changePassword = asyncHandler(async (req, res) => {
  const { oldPassword, newPassword } = changePasswordSchema.parse(req.body);
  await authService.changePassword(req.user.id, oldPassword, newPassword);
  res.clearCookie("accessToken", { path: "/" });
  res.clearCookie("refreshToken", { path: "/" });
  return ok(res, {}, "Password changed. Please log in again.");
});

export const me = asyncHandler(async (req, res) => {
  const user = await authService.getMe(req.user.id);
  return ok(res, { user: user.toSafeJSON() });
});
