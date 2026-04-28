import { useCallback } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Sparkles, ArrowRight } from "lucide-react";
import { format } from "date-fns";
import { useAuth } from "../../store/authStore.js";
import { useSocketEvent } from "../../shared/socket/useSocket.js";
import { useNextTasks, recsKeys } from "./hooks.js";
import Spinner from "../../shared/components/Spinner.jsx";
import Badge from "../../shared/components/Badge.jsx";
import ReasonChip from "./ReasonChip.jsx";

const dueLabel = (dueDate, daysUntilDue) => {
  if (!dueDate) return "no due date";
  const d = new Date(dueDate);
  if (daysUntilDue == null) return format(d, "MMM d");
  if (daysUntilDue < -1) return `${Math.abs(Math.round(daysUntilDue))}d overdue`;
  if (daysUntilDue < 0) return "overdue";
  if (daysUntilDue < 1) return "due today";
  if (daysUntilDue < 2) return "due tomorrow";
  return format(d, "EEE MMM d");
};

export default function NextTaskCard() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const q = useNextTasks(user?.id, { enabled: !!user?.id });

  // Live-feel: refetch the recommendation when any task in any of my projects
  // changes status. Backend Redis cache is also busted on the same writes, so
  // the second request comes back fresh.
  useSocketEvent(
    "taskUpdated",
    useCallback(() => {
      if (user?.id) qc.invalidateQueries({ queryKey: recsKeys.next(user.id) });
    }, [qc, user?.id]),
  );

  return (
    <section className="rounded-lg border border-violet-100 bg-gradient-to-br from-violet-50 via-white to-white p-4">
      <header className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Sparkles size={14} className="text-violet-500" />
          <h3 className="text-xs font-semibold uppercase tracking-wide text-violet-700">
            Recommended next
          </h3>
        </div>
        <span className="text-[10px] text-slate-400">top 3 for you right now</span>
      </header>

      {q.isLoading ? (
        <div className="flex h-24 items-center justify-center">
          <Spinner />
        </div>
      ) : (q.data?.data?.items || []).length === 0 ? (
        <p className="py-4 text-center text-xs text-slate-500">
          Nothing to recommend yet — pick a task on the board to get started.
        </p>
      ) : (
        <ul className="space-y-2">
          {(q.data?.data?.items || []).map((rec) => (
            <li
              key={rec.taskId}
              className="rounded-md border border-slate-100 bg-white p-2.5"
            >
              <Link
                to={`/projects/${rec.project?._id || rec.project}?task=${rec.taskId}`}
                className="group flex items-start gap-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-medium text-slate-900 group-hover:text-violet-700">
                      {rec.title}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-500">
                    <Badge tone={rec.priority}>{rec.priority}</Badge>
                    <span>·</span>
                    <span>{dueLabel(rec.dueDate, rec.daysUntilDue)}</span>
                    <span>·</span>
                    <span className="truncate">
                      {rec.project?.name || "—"}
                    </span>
                    <span className="ml-auto rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700">
                      {Math.round(rec.score)}
                    </span>
                  </div>
                  <ReasonChip
                    reason={rec.reason}
                    factors={
                      rec.factors
                        ? Object.entries(rec.factors).map(([name, raw]) => ({
                            name,
                            contribution: raw,
                          }))
                        : null
                    }
                    aiBadge
                  />
                </div>
                <ArrowRight
                  size={14}
                  className="mt-1 shrink-0 text-slate-300 group-hover:text-violet-500"
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
