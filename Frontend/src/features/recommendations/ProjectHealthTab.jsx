import { useCallback } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Activity, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { useSocketEvent } from "../../shared/socket/useSocket.js";
import { useProjectHealth, recsKeys } from "./hooks.js";
import Spinner from "../../shared/components/Spinner.jsx";
import Badge from "../../shared/components/Badge.jsx";
import Avatar from "../../shared/components/Avatar.jsx";
import ReasonChip from "./ReasonChip.jsx";
import RebalancerPanel from "./RebalancerPanel.jsx";

const labelTone = (label) => {
  if (label === "high") return "bg-red-50 text-red-700 border-red-200";
  if (label === "medium") return "bg-amber-50 text-amber-700 border-amber-200";
  return "bg-emerald-50 text-emerald-700 border-emerald-200";
};

export default function ProjectHealthTab({ projectId }) {
  const qc = useQueryClient();
  const q = useProjectHealth(projectId);

  useSocketEvent(
    "taskUpdated",
    useCallback(
      (payload) => {
        // Only invalidate when the event is for THIS project — other projects
        // changing shouldn't force a refetch here.
        if (!payload?.projectId || String(payload.projectId) === String(projectId)) {
          qc.invalidateQueries({ queryKey: recsKeys.health(projectId) });
          qc.invalidateQueries({ queryKey: recsKeys.rebalance(projectId) });
        }
      },
      [qc, projectId],
    ),
  );

  if (q.isLoading)
    return (
      <div className="flex h-40 items-center justify-center">
        <Spinner />
      </div>
    );

  const data = q.data?.data;
  if (!data)
    return (
      <p className="py-8 text-center text-xs text-slate-500">
        Couldn't load project health.
      </p>
    );

  const factors = data.factors || [];
  const slipping = data.slippingTasks || [];
  const showFactorBreakdown = factors.length > 0;

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-slate-100 bg-white p-4">
        <header className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity size={16} className="text-slate-500" />
            <h3 className="text-sm font-semibold text-slate-900">
              Project risk
            </h3>
          </div>
          <span
            className={`rounded border px-2 py-0.5 text-[11px] font-semibold ${labelTone(data.label)}`}
          >
            {data.label} · {Math.round(data.score)}
          </span>
        </header>

        <ReasonChip reason={data.reason} factors={factors} aiBadge tone="slate" />

        {showFactorBreakdown && (
          <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-5">
            {factors.map((f) => (
              <div
                key={f.name}
                className="rounded border border-slate-100 bg-slate-50/40 p-2"
              >
                <div className="text-[10px] uppercase tracking-wide text-slate-500">
                  {f.name}
                </div>
                <div className="mt-0.5 text-sm font-semibold text-slate-800">
                  {f.contribution.toFixed(1)}
                </div>
                <div className="text-[10px] text-slate-400">raw {String(f.raw)}</div>
              </div>
            ))}
          </div>
        )}

        {data.counts && (
          <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-slate-600">
            <span>
              <strong>{data.counts.activeTotal}</strong> active
            </span>
            {data.counts.overdue > 0 && (
              <span className="text-red-600">
                <strong>{data.counts.overdue}</strong> overdue
              </span>
            )}
            {data.counts.slipping > 0 && (
              <span className="text-amber-600">
                <strong>{data.counts.slipping}</strong> slipping
              </span>
            )}
            {data.counts.blocked > 0 && (
              <span>
                <strong>{data.counts.blocked}</strong> blocked
              </span>
            )}
          </div>
        )}
      </section>

      {slipping.length > 0 && (
        <section className="rounded-lg border border-slate-100 bg-white p-4">
          <header className="mb-2 flex items-center gap-1.5">
            <AlertCircle size={14} className="text-amber-500" />
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-700">
              Top tasks driving the risk
            </h3>
          </header>
          <ul className="divide-y divide-slate-100">
            {slipping.map((t) => (
              <li key={String(t._id)}>
                <Link
                  to={`/projects/${projectId}?task=${t._id}`}
                  className="flex items-center justify-between py-2 text-sm hover:bg-slate-50"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-slate-800">
                      {t.title}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-500">
                      <Badge tone={t.priority}>{t.priority}</Badge>
                      {t.dueDate ? (
                        <span>due {format(new Date(t.dueDate), "MMM d")}</span>
                      ) : null}
                      <span>· {t.status}</span>
                    </div>
                  </div>
                  <div className="ml-3 flex -space-x-1">
                    {(t.assignees || []).slice(0, 3).map((a) => (
                      <Avatar key={String(a._id)} name={a.name} src={a.avatar} size={20} />
                    ))}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <RebalancerPanel projectId={projectId} />
    </div>
  );
}
