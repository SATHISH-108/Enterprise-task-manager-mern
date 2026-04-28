import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
} from "@dnd-kit/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useProjectTasks, STATUS_ORDER } from "./hooks/useKanban.js";
import Column from "./Column.jsx";
import TaskCard from "./TaskCard.jsx";
import TaskDrawer from "./TaskDrawer.jsx";
import Modal from "../../shared/components/Modal.jsx";
import Button from "../../shared/components/Button.jsx";
import Input, { Textarea } from "../../shared/components/Input.jsx";
import Spinner from "../../shared/components/Spinner.jsx";
import { tasksApi, aiApi, projectsApi } from "../../shared/api/endpoints.js";

export default function KanbanBoard({ projectId }) {
  const qc = useQueryClient();
  const [filterPriority, setFilterPriority] = useState("");
  const [filterAssignee, setFilterAssignee] = useState("");
  const { columns, isLoading } = useProjectTasks(projectId, {
    priority: filterPriority,
    assignee: filterAssignee,
  });
  const [activeTask, setActiveTask] = useState(null);
  const [drawerId, setDrawerId] = useState(null);
  const [newTask, setNewTask] = useState(null); // { status } or null

  // Open the task drawer automatically if the URL has ?task=<id>
  // (used by notification clicks via TaskRedirect).
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const t = searchParams.get("task");
    if (t && t !== drawerId) setDrawerId(t);
  }, [searchParams, drawerId]);

  const closeDrawer = () => {
    setDrawerId(null);
    if (searchParams.has("task")) {
      const sp = new URLSearchParams(searchParams);
      sp.delete("task");
      setSearchParams(sp, { replace: true });
    }
  };

  // assignee options come from the project members
  const projectQ = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => projectsApi.get(projectId),
    enabled: !!projectId,
  });
  const memberOptions = useMemo(() => {
    const m = projectQ.data?.data?.project?.members || [];
    return m.map((u) => ({ id: u._id || u, name: u.name || u.email || "?" }));
  }, [projectQ.data]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const moveStatus = useMutation({
    mutationFn: ({ id, status, position }) =>
      tasksApi.patchStatus(id, status, position),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["tasks", "project", projectId] }),
  });

  const onDragStart = ({ active }) => {
    const { task } = active.data.current || {};
    setActiveTask(task);
  };

  const onDragEnd = ({ active, over }) => {
    setActiveTask(null);
    if (!over) return;
    const fromTask = active.data.current?.task;
    if (!fromTask) return;

    const overType = over.data.current?.type;
    let targetStatus = null;
    let targetIndex = null;

    if (overType === "column") {
      targetStatus = over.data.current.status;
      targetIndex = columns[targetStatus].length;
    } else if (overType === "task") {
      const overTask = over.data.current.task;
      targetStatus = overTask.status;
      targetIndex = columns[targetStatus].findIndex(
        (t) => t._id === overTask._id,
      );
    }
    if (!targetStatus) return;

    // compute the position as a simple index; server is source of truth
    moveStatus.mutate({
      id: fromTask._id,
      status: targetStatus,
      position: targetIndex,
    });
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 px-2 pt-2">
        <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
          Filters
        </span>
        <select
          value={filterPriority}
          onChange={(e) => setFilterPriority(e.target.value)}
          className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs"
        >
          <option value="">All priorities</option>
          <option value="urgent">Urgent</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <select
          value={filterAssignee}
          onChange={(e) => setFilterAssignee(e.target.value)}
          className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs"
        >
          <option value="">All assignees</option>
          {memberOptions.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        {(filterPriority || filterAssignee) && (
          <button
            onClick={() => {
              setFilterPriority("");
              setFilterAssignee("");
            }}
            className="text-[11px] text-slate-500 hover:text-slate-800"
          >
            Clear
          </button>
        )}
      </div>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      >
        <div className="flex h-[calc(100vh-160px)] gap-3 overflow-x-auto p-2">
          {STATUS_ORDER.map((status) => (
            <Column
              key={status}
              status={status}
              tasks={columns[status] || []}
              onTaskClick={(t) => setDrawerId(t._id)}
              onAddTask={(s) => setNewTask({ status: s })}
            />
          ))}
        </div>
        <DragOverlay>
          {activeTask ? <TaskCard task={activeTask} /> : null}
        </DragOverlay>
      </DndContext>

      {drawerId && (
        <TaskDrawer taskId={drawerId} onClose={closeDrawer} />
      )}

      <NewTaskModal
        open={!!newTask}
        onClose={() => setNewTask(null)}
        projectId={projectId}
        initialStatus={newTask?.status}
      />
    </>
  );
}

function NewTaskModal({ open, onClose, projectId, initialStatus }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("medium");
  const [aiLoading, setAiLoading] = useState(false);

  const reset = () => {
    setTitle("");
    setDescription("");
    setPriority("medium");
  };

  const create = useMutation({
    mutationFn: (data) => tasksApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks", "project", projectId] });
      reset();
      onClose();
    },
  });

  const suggest = async () => {
    if (!title) return;
    setAiLoading(true);
    try {
      const res = await aiApi.describe(title);
      if (res.data?.description) setDescription(res.data.description);
      if (res.data?.priority) setPriority(res.data.priority);
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Create task">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!title.trim()) return;
          create.mutate({
            project: projectId,
            title: title.trim(),
            description,
            priority,
            status: initialStatus || "todo",
          });
        }}
        className="space-y-3"
      >
        <Input
          label="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Build login page"
          autoFocus
        />
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-slate-600">Description</span>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            loading={aiLoading}
            onClick={suggest}
            disabled={!title}
          >
            ✨ AI suggest
          </Button>
        </div>
        <Textarea
          rows={4}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Optional details…"
        />
        <div className="flex gap-3">
          <label className="block flex-1">
            <span className="mb-1 block text-xs font-medium text-slate-600">
              Priority
            </span>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
            >
              {["low", "medium", "high", "urgent"].map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={create.isPending}>
            Create
          </Button>
        </div>
      </form>
    </Modal>
  );
}
