import helmet from "helmet";
import cors from "cors";
import { corsOrigins } from "../config/env.js";
import logger from "../config/logger.js";

export const corsMiddleware = cors({
  origin(origin, cb) {
    // allow non-browser clients (curl, server-to-server) and explicit allowlist
    if (!origin) return cb(null, true);
    if (corsOrigins.includes(origin)) return cb(null, true);
    logger.warn(`CORS blocked origin: ${origin}`);
    return cb(new Error("Not allowed by CORS"));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
});

export const helmetMiddleware = helmet({
  // relax COEP so Socket.IO polling + Cloudinary images work
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" },
});

// In-place sanitizer compatible with Express 5 (req.query is a read-only getter).
// Renames any key starting with "$" or containing "." in req.body/params/query.
const sanitizeKeys = (obj) => {
  if (!obj || typeof obj !== "object") return;
  for (const key of Object.keys(obj)) {
    const value = obj[key];
    if (value && typeof value === "object") sanitizeKeys(value);
    if (key.startsWith("$") || key.includes(".")) {
      const safeKey = key.replace(/^\$/, "_").replace(/\./g, "_");
      delete obj[key];
      obj[safeKey] = value;
    }
  }
};

export const sanitizeMiddleware = (req, _res, next) => {
  sanitizeKeys(req.body);
  sanitizeKeys(req.params);
  sanitizeKeys(req.query);
  next();
};
