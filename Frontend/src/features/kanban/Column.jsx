import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Plus } from "lucide-react";
import TaskCard from "./TaskCard.jsx";
import { statusLabel } from "../../shared/components/Badge.jsx";

export default function Column({ status, tasks, onTaskClick, onAddTask }) {
  const { setNodeRef, isOver } = useDroppable({
    id: `col:${status}`,
    data: { type: "column", status },
  });

  return (
    <div
      ref={setNodeRef}
      className={`flex h-full w-72 shrink-0 flex-col rounded-lg border border-slate-100 bg-slate-50 p-2 transition-colors ${isOver ? "bg-slate-100" : ""}`}
    >
      <header className="mb-2 flex items-center justify-between px-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">
          {statusLabel(status)}{" "}
          <span className="text-slate-400">({tasks.length})</span>
        </span>
        {onAddTask && (
          <button
            type="button"
            onClick={() => onAddTask(status)}
            className="rounded p-1 text-slate-400 hover:bg-white hover:text-slate-700"
            title="Add task"
          >
            <Plus size={14} />
          </button>
        )}
      </header>
      <SortableContext
        items={tasks.map((t) => t._id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="flex flex-1 flex-col gap-2 overflow-y-auto pb-1">
          {tasks.map((t) => (
            <TaskCard key={t._id} task={t} onClick={onTaskClick} />
          ))}
          {tasks.length === 0 && (
            <div className="py-4 text-center text-[11px] text-slate-400">
              Drop tasks here
            </div>
          )}
        </div>
      </SortableContext>
    </div>
  );
}
