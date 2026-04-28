import { useEffect, useMemo, useState, useCallback } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
} from "@dnd-kit/core";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { ListChecks } from "lucide-react";
import { tasksApi, teamsApi, projectsApi } from "../../shared/api/endpoints.js";
import { useAuth } from "../../store/authStore.js";
import { useSocketEvent } from "../../shared/socket/useSocket.js";
import Column from "../kanban/Column.jsx";
import TaskCard from "../kanban/TaskCard.jsx";
import TaskDrawer from "../kanban/TaskDrawer.jsx";
import { STATUS_ORDER } from "../kanban/hooks/useKanban.js";
import Spinner from "../../shared/components/Spinner.jsx";
import Modal from "../../shared/components/Modal.jsx";
import Button from "../../shared/components/Button.jsx";
import Input, { Textarea } from "../../shared/components/Input.jsx";

const ASSIGNEE_MODES = {
  mine: "mine",
  any: "any",
};

export default function AllTasksPage() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const [filterTeam, setFilterTeam] = useState("");
  const [filterProject, setFilterProject] = useState("");
  const [assigneeMode, setAssigneeMode] = useState(ASSIGNEE_MODES.mine);
  const [filterPriority, setFilterPriority] = useState("");

  const [activeTask, setActiveTask] = useState(null);
  const [drawerId, setDrawerId] = useState(null);
  const [newTask, setNewTask] = useState(null); // { status } | null

  const teamsQ = useQuery({
    queryKey: ["teams"],
    queryFn: () => teamsApi.list(),
  });
  const projectsQ = useQuery({
    queryKey: ["projects", { team: filterTeam }],
    queryFn: () =>
      projectsApi.list(filterTeam ? { team: filterTeam } : undefined),
  });

  // Reset project filter if it doesn't belong to the selected team anymore.
  useEffect(() => {
    if (!filterProject) return;
    const projects = projectsQ.data?.data?.projects || [];
    if (!projects.some((p) => String(p._id) === String(filterProject))) {
      setFilterProject("");
    }
  }, [filterTeam, filterProject, projectsQ.data]);

  const tasksParams = useMemo(() => {
    const p = { limit: 200 };
    if (filterProject) p.project = filterProject;
    else if (filterTeam) p.team = filterTeam;
    if (filterPriority) p.priority = filterPriority;
    if (assigneeMode === ASSIGNEE_MODES.mine && user?.id) p.assignee = user.id;
    return p;
  }, [filterTeam, filterProject, filterPriority, assigneeMode, user?.id]);

  const tasksQ = useQuery({
    queryKey: ["all-tasks", tasksParams],
    queryFn: () => tasksApi.list(tasksParams),
    enabled: !!user,
  });

  const refresh = useCallback(
    () => qc.invalidateQueries({ queryKey: ["all-tasks"] }),
    [qc],
  );
  useSocketEvent("taskUpdated", refresh);

  const moveStatus = useMutation({
    mutationFn: ({ id, status, position }) =>
      tasksApi.patchStatus(id, status, position),
    onSuccess: refresh,
    onError: (err) => {
      // Common case: backend rejected the move because dependencies aren't met.
      // The kanban already reverts on refetch; surface the message.
      const msg =
        err?.response?.data?.message ||
        "Couldn't move that task — refresh and try again.";
      // eslint-disable-next-line no-alert
      alert(msg);
      refresh();
    },
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const columns = useMemo(() => {
    const items = tasksQ.data?.data?.items || [];
    const map = Object.fromEntries(STATUS_ORDER.map((s) => [s, []]));
    for (const t of items) (map[t.status] || map.todo).push(t);
    for (const s of STATUS_ORDER)
      map[s].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    return map;
  }, [tasksQ.data]);

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
      targetIndex = (columns[targetStatus] || []).length;
    } else if (overType === "task") {
      const overTask = over.data.current.task;
      targetStatus = overTask.status;
      targetIndex = (columns[targetStatus] || []).findIndex(
        (t) => t._id === overTask._id,
      );
    }
    if (!targetStatus) return;

    moveStatus.mutate({
      id: fromTask._id,
      status: targetStatus,
      position: targetIndex,
    });
  };

  const teams = teamsQ.data?.data?.teams || [];
  const projects = projectsQ.data?.data?.projects || [];

  return (
    <main className="mx-auto max-w-[1400px] px-4 py-4">
      <header className="mb-3 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-500">
            <ListChecks size={13} />
            Cross-project board
          </div>
          <h1 className="mt-0.5 text-lg font-semibold text-slate-900">
            All tasks
          </h1>
        </div>
      </header>

      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-slate-100 bg-white p-2.5">
        <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
          Filters
        </span>
        <select
          value={filterTeam}
          onChange={(e) => setFilterTeam(e.target.value)}
          className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs"
        >
          <option value="">All teams</option>
          {teams.map((t) => (
            <option key={t._id} value={t._id}>
              {t.name}
            </option>
          ))}
        </select>
        <select
          value={filterProject}
          onChange={(e) => setFilterProject(e.target.value)}
          className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs"
        >
          <option value="">All projects</option>
          {projects.map((p) => (
            <option key={p._id} value={p._id}>
              {p.name}
            </option>
          ))}
        </select>
        <select
          value={assigneeMode}
          onChange={(e) => setAssigneeMode(e.target.value)}
          className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs"
        >
          <option value={ASSIGNEE_MODES.mine}>My tasks</option>
          <option value={ASSIGNEE_MODES.any}>All assignees</option>
        </select>
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
        {(filterTeam ||
          filterProject ||
          filterPriority ||
          assigneeMode !== ASSIGNEE_MODES.mine) && (
          <button
            type="button"
            onClick={() => {
              setFilterTeam("");
              setFilterProject("");
              setFilterPriority("");
              setAssigneeMode(ASSIGNEE_MODES.mine);
            }}
            className="text-[11px] text-slate-500 hover:text-slate-800"
          >
            Reset
          </button>
        )}
        <span className="ml-auto text-[11px] text-slate-400">
          {tasksQ.isFetching ? "Refreshing…" : `${(tasksQ.data?.data?.items || []).length} tasks`}
        </span>
      </div>

      {tasksQ.isLoading ? (
        <div className="flex h-60 items-center justify-center">
          <Spinner />
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={({ active }) =>
            setActiveTask(active.data.current?.task || null)
          }
          onDragEnd={onDragEnd}
        >
          <div className="flex h-[calc(100vh-220px)] gap-3 overflow-x-auto pb-2">
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
      )}

      {drawerId && (
        <TaskDrawer taskId={drawerId} onClose={() => setDrawerId(null)} />
      )}

      <CreateTaskModal
        open={!!newTask}
        onClose={() => setNewTask(null)}
        initialStatus={newTask?.status}
        defaultProjectId={filterProject}
        projects={projects}
        onCreated={refresh}
      />
    </main>
  );
}

function CreateTaskModal({
  open,
  onClose,
  initialStatus,
  defaultProjectId,
  projects,
  onCreated,
}) {
  const [project, setProject] = useState(defaultProjectId || "");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("medium");

  // Sync the project picker to whatever the page is currently filtered to.
  // Without this, opening the modal a second time after changing the filter
  // would keep showing the previous selection.
  useEffect(() => {
    if (open) setProject(defaultProjectId || "");
  }, [open, defaultProjectId]);

  const reset = () => {
    setTitle("");
    setDescription("");
    setPriority("medium");
  };

  const create = useMutation({
    mutationFn: (data) => tasksApi.create(data),
    onSuccess: () => {
      reset();
      onCreated?.();
      onClose();
    },
  });

  const submit = (e) => {
    e.preventDefault();
    if (!project) return;
    if (!title.trim()) return;
    create.mutate({
      project,
      title: title.trim(),
      description,
      priority,
      status: initialStatus || "todo",
    });
  };

  return (
    <Modal open={open} onClose={onClose} title="Create task">
      <form onSubmit={submit} className="space-y-3">
        {!defaultProjectId && (
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">
              Project
            </span>
            <select
              value={project}
              onChange={(e) => setProject(e.target.value)}
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
              required
            >
              <option value="">Select a project…</option>
              {projects.map((p) => (
                <option key={p._id} value={p._id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <Input
          label="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Build login page"
          autoFocus
        />
        <Textarea
          label="Description"
          rows={4}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Optional details…"
        />
        <label className="block">
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
        {create.isError && (
          <div className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">
            {create.error?.response?.data?.message || "Failed to create task"}
          </div>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={create.isPending} disabled={!project}>
            Create
          </Button>
        </div>
      </form>
    </Modal>
  );
}
