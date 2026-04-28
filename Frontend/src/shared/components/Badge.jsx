const PRIORITY = {
  low: "bg-slate-100 text-slate-600",
  medium: "bg-sky-100 text-sky-800",
  high: "bg-amber-100 text-amber-800",
  urgent: "bg-red-100 text-red-800",
};

const STATUS = {
  backlog: "bg-slate-100 text-slate-600",
  todo: "bg-blue-100 text-blue-800",
  in_progress: "bg-indigo-100 text-indigo-800",
  in_review: "bg-violet-100 text-violet-800",
  blocked: "bg-red-100 text-red-800",
  completed: "bg-emerald-100 text-emerald-800",
  archived: "bg-slate-200 text-slate-500",
};

export default function Badge({ tone = "slate", children, className = "" }) {
  const cls =
    PRIORITY[tone] ||
    STATUS[tone] ||
    `bg-${tone}-100 text-${tone}-800`;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${cls} ${className}`}
    >
      {children}
    </span>
  );
}

export const statusLabel = (s) =>
  ({
    backlog: "Backlog",
    todo: "Todo",
    in_progress: "In progress",
    in_review: "In review",
    blocked: "Blocked",
    completed: "Completed",
    archived: "Archived",
  })[s] || s;
