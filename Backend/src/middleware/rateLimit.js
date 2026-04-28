import rateLimit from "express-rate-limit";

const json = (message) => ({ success: false, message });

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: json("Too many login attempts. Try again in 15 minutes."),
});

export const authLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: json("Too many auth requests. Try again later."),
});

export const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: json("AI rate limit — try again in a minute."),
});
