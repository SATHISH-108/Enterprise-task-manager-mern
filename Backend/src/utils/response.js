/**
 * Standard JSON envelopes so all V2 modules are consistent.
 */

export const ok = (res, data = {}, message = "OK") =>
  res.status(200).json({ success: true, message, data });

export const created = (res, data = {}, message = "Created") =>
  res.status(201).json({ success: true, message, data });

export const noContent = (res) => res.status(204).end();

export const fail = (res, status, message, errors) =>
  res.status(status).json({
    success: false,
    message,
    ...(errors ? { errors } : {}),
  });

export class HttpError extends Error {
  constructor(status, message, errors) {
    super(message);
    this.status = status;
    this.errors = errors;
  }
}

export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);
