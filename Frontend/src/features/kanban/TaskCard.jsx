import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CalendarDays, Lock, MessageSquare, Paperclip } from "lucide-react";
import { format } from "date-fns";
import Avatar from "../../shared/components/Avatar.jsx";
import Badge from "../../shared/components/Badge.jsx";

const DONE_STATUSES = new Set(["completed", "archived"]);

export default function TaskCard({ task, onClick }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: task._id, data: { type: "task", task } });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const overdue =
    task.dueDate &&
    new Date(task.dueDate) < new Date() &&
    !["completed", "archived"].includes(task.status);

  // Backend's listTasks now populates dependencies with just `status`. If any
  // dep is not yet completed/archived, the task is "blocked-by-dep" and the
  // server will reject a move into in_progress / in_review / completed.
  const unmetDeps = (task.dependencies || []).filter(
    (d) => d && !DONE_STATUSES.has(d.status),
  );
  const hasUnmetDeps = unmetDeps.length > 0;

  return (
    <article
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => onClick?.(task)}
      className="cursor-pointer rounded-md border border-slate-100 bg-white p-3 shadow-sm transition hover:border-slate-300 hover:shadow"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="flex items-center gap-1 text-sm font-medium leading-snug text-slate-900">
          {hasUnmetDeps ? (
            <Lock
              size={12}
              className="shrink-0 text-amber-500"
              aria-label={`Blocked by ${unmetDeps.length} dependency${unmetDeps.length === 1 ? "" : "ies"}`}
            />
          ) : null}
          <span>{task.title}</span>
        </h3>
        <Badge tone={task.priority}>{task.priority}</Badge>
      </div>
      {task.description ? (
        <p className="mt-1 line-clamp-2 text-xs text-slate-500">
          {task.description}
        </p>
      ) : null}
      <div className="mt-3 flex items-center justify-between gap-2">
        <div className="flex -space-x-1">
          {(task.assignees || []).slice(0, 3).map((a) => (
            <Avatar
              key={a._id || a}
              name={a.name || "?"}
              src={a.avatar}
              size={22}
            />
          ))}
        </div>
        <div className="flex items-center gap-2 text-[11px] text-slate-500">
          {task.attachments?.length ? (
            <span className="inline-flex items-center gap-0.5">
              <Paperclip size={11} /> {task.attachments.length}
            </span>
          ) : null}
          {task.dueDate ? (
            <span
              className={`inline-flex items-center gap-0.5 ${overdue ? "text-red-600" : ""}`}
            >
              <CalendarDays size={11} />
              {format(new Date(task.dueDate), "MMM d")}
            </span>
          ) : null}
          <span className="inline-flex items-center gap-0.5">
            <MessageSquare size={11} />
          </span>
        </div>
      </div>
    </article>
  );
}
