import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(7002),
  CLIENT_ORIGIN: z.string().url().default("http://localhost:5173"),
  CORS_ALLOWLIST: z.string().optional(),

  MONGO_URI: z.string().min(1, "MONGO_URI required"),

  JWT_ACCESS_SECRET: z.string().min(8, "JWT_ACCESS_SECRET too short"),
  JWT_REFRESH_SECRET: z.string().min(8, "JWT_REFRESH_SECRET too short"),

  REDIS_URL: z.string().min(1, "REDIS_URL required"),

  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),

  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),

  DEEPSEEK_API_KEY: z.string().optional(),
  AI_MODEL: z.string().default("deepseek-chat"),

  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_CONTACT_EMAIL: z.string().email().optional(),

  SLACK_WEBHOOK_URL: z.string().url().optional(),

  APP_URL: z.string().url().default("http://localhost:5173"),

  // When true (default), the backend rejects status transitions to
  // in_progress / in_review / completed if any of the task's dependencies
  // are not yet in completed/archived status. Set to "false" in projects
  // where dependencies should be advisory rather than blocking.
  STRICT_DEPENDENCIES: z
    .union([z.literal("true"), z.literal("false")])
    .default("true")
    .transform((v) => v === "true"),

  // When true (default), the backend boots a periodic job that scans active
  // tasks for "due soon" (within 24h) and "overdue" thresholds, firing
  // task_due_soon / task_overdue notifications via the standard dispatcher.
  // Set to "false" in tests or environments that prefer to run the scan
  // out-of-process (e.g. external cron).
  DUE_DATE_SCANNER_ENABLED: z
    .union([z.literal("true"), z.literal("false")])
    .default("true")
    .transform((v) => v === "true"),

  // When true (default), enforce double-submit CSRF tokens on state-changing
  // requests. The XSRF-TOKEN cookie is always issued either way; only the
  // header check is gated. Disable for non-browser clients / integration
  // tests where attaching the header is impractical.
  CSRF_PROTECTION: z
    .union([z.literal("true"), z.literal("false")])
    .default("true")
    .transform((v) => v === "true"),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error("Invalid environment:", parsed.error.flatten().fieldErrors);
  throw new Error("Environment validation failed — see logs");
}

const env = parsed.data;

export const isProd = env.NODE_ENV === "production";
export const isTest = env.NODE_ENV === "test";

export const corsOrigins = (env.CORS_ALLOWLIST || env.CLIENT_ORIGIN)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

export const aiEnabled = !!env.DEEPSEEK_API_KEY;

export const cloudinaryEnabled =
  !!env.CLOUDINARY_CLOUD_NAME &&
  !!env.CLOUDINARY_API_KEY &&
  !!env.CLOUDINARY_API_SECRET;

export default env;
