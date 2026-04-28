/**
 * Escape every regex metacharacter in a user-supplied string so it can be
 * safely used as a literal pattern with Mongo `$regex` / `new RegExp()`.
 *
 * Without this, characters like `\`, `(`, `[`, `?`, `*`, `+`, `^`, `$` cause
 * one of two problems:
 *   1. Crash — Mongo throws "Regular expression is invalid" on patterns
 *      like `foo\` (trailing backslash) or `foo[` (unclosed class).
 *   2. ReDoS / regex injection — patterns like `(a+)+` against a long input
 *      cause catastrophic backtracking and stall the database.
 *
 * Always run user input through this before stuffing it into a regex query.
 */
export const escapeRegex = (s) =>
  String(s ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export default escapeRegex;
