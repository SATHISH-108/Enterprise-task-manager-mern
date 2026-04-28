import { useState } from "react";
import { Users, ArrowRight, Check, X } from "lucide-react";
import { useAuth } from "../../store/authStore.js";
import { useRebalance, useAcceptRebalance } from "./hooks.js";
import Spinner from "../../shared/components/Spinner.jsx";
import Badge from "../../shared/components/Badge.jsx";
import ReasonChip from "./ReasonChip.jsx";

export default function RebalancerPanel({ projectId }) {
  const { user } = useAuth();
  const q = useRebalance(projectId);
  const accept = useAcceptRebalance(projectId);
  const [acceptedIds, setAcceptedIds] = useState(new Set());

  const isAdmin = user?.role === "admin";
  const items = q.data?.data?.suggestions || [];

  if (q.isLoading)
    return (
      <div className="flex h-24 items-center justify-center">
        <Spinner />
      </div>
    );

  if (!items.length) {
    return (
      <p className="py-4 text-center text-xs text-emerald-600">
        Workload looks balanced. No reassignment suggestions right now.
      </p>
    );
  }

  const apply = (sug) => {
    setAcceptedIds((prev) => new Set(prev).add(sug.taskId));
    accept.mutate(
      { taskId: sug.taskId, newAssigneeId: sug.toUserId },
      {
        onError: () => {
          setAcceptedIds((prev) => {
            const next = new Set(prev);
            next.delete(sug.taskId);
            return next;
          });
        },
      },
    );
  };

  return (
    <section className="rounded-lg border border-slate-100 bg-white p-4">
      <header className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Users size={14} className="text-slate-500" />
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-700">
            Suggested reassignments
          </h3>
        </div>
        {!isAdmin && (
          <span className="text-[10px] text-slate-400">
            View-only (admins can apply)
          </span>
        )}
      </header>

      <ul className="space-y-2">
        {items.map((s) => {
          const accepted = acceptedIds.has(s.taskId);
          return (
            <li
              key={s.taskId}
              className={`rounded-md border border-slate-100 p-2.5 ${accepted ? "bg-emerald-50/40 opacity-60" : "bg-slate-50/40"}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-sm">
                    <span
                      className={`truncate font-medium text-slate-900 ${accepted ? "line-through" : ""}`}
                    >
                      {s.taskTitle}
                    </span>
                    <Badge tone={s.priority}>{s.priority}</Badge>
                  </div>
                  <div className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-600">
                    <span className="font-medium">{s.fromUserName}</span>
                    <ArrowRight size={12} className="text-slate-400" />
                    <span className="font-medium text-emerald-700">
                      {s.toUserName}
                    </span>
                    <span className="ml-auto text-slate-400">
                      − {s.expectedLoadDelta} load
                    </span>
                  </div>
                  <ReasonChip reason={s.reason || s.fitNote} aiBadge />
                </div>
                {isAdmin ? (
                  accepted ? (
                    <span className="mt-1 flex items-center gap-1 text-[11px] font-medium text-emerald-700">
                      <Check size={12} /> Applied
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => apply(s)}
                      disabled={accept.isPending}
                      className="mt-0.5 rounded border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                    >
                      Accept
                    </button>
                  )
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>

      {accept.isError && (
        <div className="mt-2 flex items-center gap-1 rounded bg-red-50 px-2 py-1 text-[11px] text-red-700">
          <X size={12} /> Couldn't apply that reassignment — refresh and try again.
        </div>
      )}
    </section>
  );
}
