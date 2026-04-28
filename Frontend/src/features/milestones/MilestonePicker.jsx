import { Flag } from "lucide-react";
import { useProjectMilestones } from "./hooks.js";

/**
 * Inline milestone selector for use inside TaskDrawer's Details tab.
 * `task.milestone` may be either a populated object or just an id; both work.
 */
export default function MilestonePicker({ task, onChange }) {
  const projectId = task.project?._id || task.project;
  const q = useProjectMilestones(projectId, { enabled: !!projectId });
  const milestones = q.data?.data?.items || [];
  const current = String(task.milestone?._id || task.milestone || "");

  return (
    <label className="block">
      <span className="mb-1 flex items-center gap-1 text-xs font-medium text-slate-600">
        <Flag size={11} />
        Milestone
      </span>
      <select
        value={current}
        onChange={(e) => onChange(e.target.value || null)}
        disabled={q.isLoading}
        className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
      >
        <option value="">— No milestone —</option>
        {milestones.map((m) => (
          <option key={m._id} value={m._id}>
            {m.name}
            {m.status !== "upcoming" ? ` · ${m.status}` : ""}
          </option>
        ))}
      </select>
    </label>
  );
}
