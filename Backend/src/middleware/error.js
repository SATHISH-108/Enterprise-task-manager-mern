import { ZodError } from "zod";
import mongoose from "mongoose";
import logger from "../config/logger.js";
import { HttpError } from "../utils/response.js";
import { isProd } from "../config/env.js";

export const notFound = (req, res) =>
  res.status(404).json({ success: false, message: `Not found: ${req.originalUrl}` });

// eslint-disable-next-line no-unused-vars
export const errorHandler = (err, req, res, _next) => {
  if (err instanceof ZodError) {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors: err.flatten().fieldErrors,
    });
  }

  if (err instanceof mongoose.Error.ValidationError) {
    const errors = Object.fromEntries(
      Object.entries(err.errors).map(([k, v]) => [k, [v.message]]),
    );
    return res
      .status(400)
      .json({ success: false, message: "Validation failed", errors });
  }

  if (err instanceof mongoose.Error.CastError) {
    return res
      .status(400)
      .json({ success: false, message: `Invalid ${err.path}: ${err.value}` });
  }

  if (err && err.code === 11000) {
    const field = Object.keys(err.keyPattern || {})[0] || "field";
    return res
      .status(409)
      .json({ success: false, message: `Duplicate ${field}` });
  }

  if (err instanceof HttpError) {
    return res.status(err.status).json({
      success: false,
      message: err.message,
      ...(err.errors ? { errors: err.errors } : {}),
    });
  }

  logger.error(err);
  return res.status(err.status || 500).json({
    success: false,
    message: isProd ? "Server error" : err.message || "Server error",
    ...(isProd ? {} : { stack: err.stack }),
  });
};
