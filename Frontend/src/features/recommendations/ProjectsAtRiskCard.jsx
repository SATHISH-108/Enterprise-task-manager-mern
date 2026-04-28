import { useCallback } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { useSocketEvent } from "../../shared/socket/useSocket.js";
import { useProjectsAtRisk, recsKeys } from "./hooks.js";
import Spinner from "../../shared/components/Spinner.jsx";
import ReasonChip from "./ReasonChip.jsx";

const labelTone = (label) => {
  if (label === "high") return "bg-red-50 text-red-700 border-red-200";
  if (label === "medium") return "bg-amber-50 text-amber-700 border-amber-200";
  return "bg-emerald-50 text-emerald-700 border-emerald-200";
};

export default function ProjectsAtRiskCard() {
  const qc = useQueryClient();
  const q = useProjectsAtRisk();

  const refresh = useCallback(
    () => qc.invalidateQueries({ queryKey: recsKeys.atRisk() }),
    [qc],
  );
  // Project risk shifts whenever tasks move OR when a new "elevated" notification fires.
  useSocketEvent("taskUpdated", refresh);
  useSocketEvent(
    "notification",
    useCallback(
      (payload) => {
        if (payload?.notification?.type === "project_risk_elevated") refresh();
      },
      [refresh],
    ),
  );

  const items = q.data?.data?.items || [];
  const elevated = items.filter((p) => p.label !== "low");

  return (
    <section className="rounded-lg border border-slate-100 bg-white p-4">
      <header className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <AlertTriangle size={14} className="text-amber-500" />
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-700">
            Projects at risk
          </h3>
        </div>
        <Link
          to="/projects"
          className="text-[11px] text-slate-500 hover:text-slate-800"
        >
          All projects →
        </Link>
      </header>

      {q.isLoading ? (
        <div className="flex h-24 items-center justify-center">
          <Spinner />
        </div>
      ) : elevated.length === 0 ? (
        <p className="py-4 text-center text-xs text-emerald-600">
          All projects look healthy.
        </p>
      ) : (
        <ul className="space-y-2">
          {elevated.slice(0, 5).map((p) => (
            <li
              key={String(p.projectId)}
              className="rounded-md border border-slate-100 bg-slate-50/40 p-2.5"
            >
              <div className="flex items-start justify-between gap-2">
                <Link
                  to={`/projects/${p.projectId}?tab=health`}
                  className="min-w-0 flex-1 hover:underline"
                >
                  <div className="truncate text-sm font-medium text-slate-900">
                    {p.projectName}
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-500">
                    <span
                      className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${labelTone(p.label)}`}
                    >
                      {p.label}
                    </span>
                    <span>·</span>
                    <span>score {Math.round(p.score)}</span>
                    {p.counts?.overdue ? (
                      <>
                        <span>·</span>
                        <span>{p.counts.overdue} overdue</span>
                      </>
                    ) : null}
                  </div>
                </Link>
              </div>
              <ReasonChip reason={p.reason} factors={p.factors} aiBadge />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
