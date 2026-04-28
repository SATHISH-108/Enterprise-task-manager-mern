import { useState } from "react";
import { format, differenceInDays } from "date-fns";
import { Plus, Edit2, Trash2, Flag, Timer } from "lucide-react";
import { useAuth } from "../../store/authStore.js";
import Button from "../../shared/components/Button.jsx";
import Spinner from "../../shared/components/Spinner.jsx";
import { useProjectMilestones, useMilestoneMutations } from "./hooks.js";
import MilestoneFormModal from "./MilestoneFormModal.jsx";

const statusTone = (s) => {
  if (s === "completed") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (s === "active") return "bg-sky-50 text-sky-700 border-sky-200";
  if (s === "canceled") return "bg-slate-50 text-slate-500 border-slate-200";
  return "bg-amber-50 text-amber-700 border-amber-200";
};

const ProgressBar = ({ pct, tone = "slate" }) => (
  <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
    <div
      style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
      className={`h-full rounded-full bg-${tone}-500 transition-all`}
    />
  </div>
);

const SprintProgress = ({ startDate, dueDate }) => {
  if (!startDate || !dueDate) return null;
  const start = new Date(startDate);
  const end = new Date(dueDate);
  const now = new Date();
  const total = Math.max(1, differenceInDays(end, start));
  const elapsed = Math.max(0, Math.min(total, differenceInDays(now, start)));
  const pct = (elapsed / total) * 100;
  const remaining = Math.max(0, differenceInDays(end, now));
  return (
    <div className="mt-2 rounded-md border border-sky-100 bg-sky-50/40 p-2">
      <div className="mb-1 flex items-center justify-between text-[10px] text-sky-700">
        <span className="flex items-center gap-1 font-medium">
          <Timer size={11} /> Sprint
        </span>
        <span>
          {remaining === 0 ? "Last day" : `${remaining}d remaining`} ·{" "}
          {Math.round(pct)}% elapsed
        </span>
      </div>
      <ProgressBar pct={pct} tone="sky" />
    </div>
  );
};

export default function MilestonesTab({ project }) {
  const { user } = useAuth();
  const projectId = project?._id;
  const isLead =
    user?.role === "admin" ||
    String(project?.createdBy) === String(user?.id) ||
    String(project?.team?.lead) === String(user?.id);

  const q = useProjectMilestones(projectId);
  const { remove } = useMilestoneMutations({ projectId });
  const [editing, setEditing] = useState(null); // null | "new" | <milestone>

  if (!projectId) return null;

  const items = q.data?.data?.items || [];

  const handleDelete = (m) => {
    if (!confirm(`Delete milestone "${m.name}"? Tasks won't be deleted, just unlinked.`))
      return;
    remove.mutate(m._id);
  };

  return (
    <div className="space-y-3">
      <header className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900">
          Milestones & Sprints
        </h3>
        {isLead && (
          <Button size="sm" onClick={() => setEditing("new")}>
            <Plus size={13} /> New milestone
          </Button>
        )}
      </header>

      {q.isLoading ? (
        <div className="flex h-32 items-center justify-center">
          <Spinner />
        </div>
      ) : items.length === 0 ? (
        <p className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-xs text-slate-500">
          No milestones yet.
          {isLead ? " Create one to start grouping tasks toward an outcome." : ""}
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((m) => (
            <li
              key={m._id}
              className="rounded-lg border border-slate-100 bg-white p-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Flag size={13} className="text-slate-400" />
                    <h4 className="truncate text-sm font-semibold text-slate-900">
                      {m.name}
                    </h4>
                    <span
                      className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${statusTone(m.status)}`}
                    >
                      {m.status}
                    </span>
                    {m.isSprint && (
                      <span className="rounded border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700">
                        sprint
                      </span>
                    )}
                  </div>
                  {m.description && (
                    <p className="mt-1 line-clamp-2 text-xs text-slate-600">
                      {m.description}
                    </p>
                  )}
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                    {m.dueDate && (
                      <span>
                        Due {format(new Date(m.dueDate), "MMM d, yyyy")}
                      </span>
                    )}
                    {m.startDate && m.dueDate && (
                      <span className="text-slate-400">
                        · {format(new Date(m.startDate), "MMM d")} → {format(new Date(m.dueDate), "MMM d")}
                      </span>
                    )}
                  </div>
                </div>
                {isLead && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setEditing(m)}
                      className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                      title="Edit"
                    >
                      <Edit2 size={13} />
                    </button>
                    <button
                      onClick={() => handleDelete(m)}
                      className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                      title="Delete"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                )}
              </div>

              <div className="mt-3">
                <div className="mb-1 flex items-center justify-between text-[11px] text-slate-600">
                  <span>
                    {m.progress.completed} / {m.progress.total} task
                    {m.progress.total === 1 ? "" : "s"} done
                  </span>
                  <span className="font-semibold">{m.progress.completionPct}%</span>
                </div>
                <ProgressBar
                  pct={m.progress.completionPct}
                  tone={
                    m.progress.completionPct >= 80
                      ? "emerald"
                      : m.progress.completionPct >= 40
                        ? "sky"
                        : "amber"
                  }
                />
                {m.progress.overdue > 0 && (
                  <div className="mt-1 text-[11px] text-red-600">
                    ⚠ {m.progress.overdue} overdue task
                    {m.progress.overdue === 1 ? "" : "s"}
                  </div>
                )}
              </div>

              {m.isSprint && <SprintProgress startDate={m.startDate} dueDate={m.dueDate} />}
            </li>
          ))}
        </ul>
      )}

      <MilestoneFormModal
        open={!!editing}
        onClose={() => setEditing(null)}
        projectId={projectId}
        initial={editing === "new" ? null : editing}
      />
    </div>
  );
}
