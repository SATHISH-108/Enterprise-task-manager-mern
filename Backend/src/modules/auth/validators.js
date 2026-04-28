import { z } from "zod";

// Normalize before validating — the user schema saves emails lowercased &
// trimmed (`user.model.js`), so queries must match that canonical form or
// `Admin@x.com` vs `admin@x.com` becomes a silent "Invalid credentials".
const email = z.string().trim().toLowerCase().pipe(z.string().email().max(200));
const password = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128);

export const registerSchema = z.object({
  name: z.string().min(1).max(120),
  email,
  password,
  role: z.enum(["admin", "user"]).optional(),
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1),
});

export const forgotSchema = z.object({ email });

export const resetSchema = z.object({ password });

export const changePasswordSchema = z.object({
  oldPassword: z.string().min(1),
  newPassword: password,
});
