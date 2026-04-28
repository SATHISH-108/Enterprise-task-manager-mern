// Per-kind prompts for the LLM reasoner. Each returns
// { system, prompt } that aiClient.completeJSON() can use directly.
//
// Output schema is identical across kinds: { reason: "1-2 sentences" }.
// Schema is enforced in ai/service.js — these are just prompt builders.

const NEXT_TASK_SYSTEM = `You explain why a task is the right one to work on next.
Audience: the assignee (second person, "you").
Tone: helpful and grounded — no fluff, no apologies.
Length: one sentence, max 200 characters.
Use the supplied factor scores literally; do not invent reasons.`;

const PROJECT_RISK_SYSTEM = `You explain in one sentence why a project is currently at risk of slipping.
Audience: the project lead (third person about the project).
Tone: factual, action-oriented.
Length: one sentence, max 200 characters.
Lead with the highest-contributing factor.`;

const REBALANCE_SYSTEM = `You explain in one sentence why a task should move from one assignee to another.
Audience: the project lead.
Tone: constructive, never blaming.
Length: one sentence, max 200 characters.
Lead with the load gap, then the receiver's relevant signal if available.`;

const truncate = (s, n) =>
  typeof s === "string" && s.length > n ? `${s.slice(0, n)}…` : s;

const compact = (obj) => {
  // Drop nulls/undefined and trim long strings to keep prompt token count predictable.
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v == null) continue;
    if (typeof v === "string") out[k] = truncate(v, 200);
    else out[k] = v;
  }
  return out;
};

export const buildPrompt = ({ kind, payload }) => {
  switch (kind) {
    case "next_task":
      return {
        system: NEXT_TASK_SYSTEM,
        prompt: `Task: ${JSON.stringify(compact(payload))}
Return JSON: {"reason":"…"}`,
      };

    case "project_risk":
      return {
        system: PROJECT_RISK_SYSTEM,
        prompt: `Project risk data: ${JSON.stringify(compact(payload))}
Return JSON: {"reason":"…"}`,
      };

    case "rebalance":
      return {
        system: REBALANCE_SYSTEM,
        prompt: `Reassignment data: ${JSON.stringify(compact(payload))}
Return JSON: {"reason":"…"}`,
      };

    default:
      return null;
  }
};

// Deterministic fallback when AI is unavailable. Always returns a usable string.
export const templateReason = ({ kind, payload }) => {
  switch (kind) {
    case "next_task": {
      const f = payload.factors || {};
      const dueText = payload.daysUntilDue != null
        ? payload.daysUntilDue < 0
          ? "overdue"
          : payload.daysUntilDue === 0
            ? "due today"
            : `due in ${Math.round(payload.daysUntilDue)} day${Math.round(payload.daysUntilDue) === 1 ? "" : "s"}`
        : "no due date";
      const ownership = f.ownership === 1 ? "assigned to you" : "available in your project";
      return `Top pick — ${dueText}, ${payload.priority || "medium"} priority, ${ownership}.`;
    }
    case "project_risk": {
      const top = (payload.factors || [])
        .slice()
        .sort((a, b) => b.contribution - a.contribution)[0];
      const fName = top?.name || "multiple factors";
      const counts = payload.counts || {};
      return `Risk ${payload.label || ""} (${payload.score || 0}). Driver: ${fName}; ${counts.overdue || 0} overdue / ${counts.slipping || 0} slipping.`;
    }
    case "rebalance":
      return `${payload.fromUserName} is over capacity; ${payload.toUserName} has the most headroom.`;
    default:
      return "";
  }
};
