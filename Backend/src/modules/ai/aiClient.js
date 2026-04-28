import env, { aiEnabled } from "../../config/env.js";
import logger from "../../config/logger.js";

const DEEPSEEK_BASE_URL = "https://api.deepseek.com/v1";

if (aiEnabled) {
  logger.info(`AI enabled: deepseek ${env.AI_MODEL}`);
} else {
  logger.warn(
    "AI disabled (DEEPSEEK_API_KEY missing); AI endpoints return fallback data",
  );
}

export const aiAvailable = () => aiEnabled;

const deepseekComplete = async ({ system, prompt, maxTokens }) => {
  const messages = [];
  if (system) messages.push({ role: "system", content: system });
  messages.push({ role: "user", content: prompt });

  const res = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      model: env.AI_MODEL,
      messages,
      max_tokens: maxTokens,
      temperature: 0.2,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`DeepSeek ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = await res.json();
  return (data?.choices?.[0]?.message?.content || "").trim();
};

// Last error from a DeepSeek call, exposed for callers (e.g. /ai/chat) that
// want to surface the reason in their UI rather than a generic fallback.
let lastError = "";
export const lastAiError = () => lastError;

/**
 * Thin wrapper — prompt in, text out. Always returns a string (possibly empty).
 * On error or when AI is disabled, returns "" (and stashes the reason in lastError).
 */
export const complete = async ({ system, prompt, maxTokens = 1024 }) => {
  if (!aiAvailable()) {
    lastError = "AI is disabled (DEEPSEEK_API_KEY missing)";
    return "";
  }
  try {
    const out = await deepseekComplete({ system, prompt, maxTokens });
    lastError = "";
    return out;
  } catch (err) {
    lastError = err.message || "AI call failed";
    logger.warn(`AI call failed: ${lastError}`);
    return "";
  }
};

/**
 * Same as complete() but asks the model to return strict JSON and parses it.
 * Returns null on failure so callers can apply a fallback.
 */
export const completeJSON = async (opts) => {
  const text = await complete({
    ...opts,
    system:
      (opts.system || "") +
      "\nRespond with a single JSON object. No prose, no code fences.",
  });
  if (!text) return null;
  try {
    const stripped = text.replace(/^```(?:json)?|```$/g, "").trim();
    return JSON.parse(stripped);
  } catch {
    return null;
  }
};
