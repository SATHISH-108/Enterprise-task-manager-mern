import { Sparkles, Info } from "lucide-react";

/**
 * Single source for the "why" copy on every recommendation card.
 *
 *   <ReasonChip reason="..." factors={[{name, contribution}]} aiBadge />
 *
 * - `reason` is always shown (LLM output if available, deterministic template otherwise).
 * - `factors` (optional) renders as a hover tooltip with the top contributing factor.
 * - `aiBadge` is purely cosmetic — currently every reason that came back from the
 *   server already includes its own attribution semantics, so we leave it false.
 */
export default function ReasonChip({ reason, factors, aiBadge = false, tone = "slate" }) {
  if (!reason) return null;

  const top = Array.isArray(factors)
    ? [...factors]
        .filter((f) => typeof f.contribution === "number")
        .sort((a, b) => b.contribution - a.contribution)[0]
    : null;

  return (
    <div
      className={`mt-1.5 flex items-start gap-1.5 rounded-md border border-${tone}-100 bg-${tone}-50 px-2 py-1.5 text-[11px] leading-snug text-${tone}-700`}
    >
      {aiBadge ? (
        <Sparkles size={12} className="mt-px shrink-0 text-violet-500" />
      ) : (
        <Info size={12} className="mt-px shrink-0 text-slate-400" />
      )}
      <div className="min-w-0">
        <span>{reason}</span>
        {top ? (
          <span className="ml-1 text-slate-400">· {top.name}</span>
        ) : null}
      </div>
    </div>
  );
}
