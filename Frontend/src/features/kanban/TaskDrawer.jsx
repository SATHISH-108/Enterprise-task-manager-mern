import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSocketEvent } from "../../shared/socket/useSocket.js";
import { format, formatDistanceToNow } from "date-fns";
import {
  X,
  Send,
  Trash2,
  UserPlus,
  Sparkles,
  CheckCircle2,
  RotateCcw,
  Check,
} from "lucide-react";
import { tasksApi, aiApi, projectsApi } from "../../shared/api/endpoints.js";
import { useAuth } from "../../store/authStore.js";
import Button from "../../shared/components/Button.jsx";
import Input, { Textarea } from "../../shared/components/Input.jsx";
import Badge from "../../shared/components/Badge.jsx";
import Avatar from "../../shared/components/Avatar.jsx";
import Spinner from "../../shared/components/Spinner.jsx";
import { STATUS_ORDER } from "./hooks/useKanban.js";
import Attachments from "./Attachments.jsx";
import MentionInput from "./MentionInput.jsx";
import MilestonePicker from "../milestones/MilestonePicker.jsx";
import DependencyManager from "../dependencies/DependencyManager.jsx";
import PresenceStack from "./PresenceStack.jsx";
import TimerWidget from "./TimerWidget.jsx";

const PRIORITIES = ["low", "medium", "high", "urgent"];

export default function TaskDrawer({ taskId, onClose }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [tab, setTab] = useState("details");
  const [savedAt, setSavedAt] = useState(null);
  const savedTimerRef = useRef(null);

  const taskQ = useQuery({
    queryKey: ["task", taskId],
    queryFn: () => tasksApi.get(taskId),
    enabled: !!taskId,
  });

  // Invalidate every task-flavoured query so a status change made from inside
  // the drawer (e.g. Mark complete, status dropdown) immediately reflects on
  // BOTH the per-project kanban (`["tasks", "project", id]`) and the cross-
  // project AllTasksPage (`["all-tasks", params]`). Predicate-based because
  // their key prefixes don't share a common root.
  const refreshAllTaskQueries = () =>
    qc.invalidateQueries({
      predicate: (q) => {
        const k = q.queryKey[0];
        return (
          k === "task" ||
          k === "tasks" ||
          k === "all-tasks" ||
          k === "dependencies" ||
          k === "activity"
        );
      },
    });

  const update = useMutation({
    mutationFn: (patch) => tasksApi.update(taskId, patch),
    onSuccess: () => {
      refreshAllTaskQueries();
      setSavedAt(Date.now());
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      savedTimerRef.current = setTimeout(() => setSavedAt(null), 3500);
    },
    onError: (err) => {
      const msg =
        err?.response?.data?.message || "Couldn't save changes — try again.";
      // eslint-disable-next-line no-alert
      alert(msg);
    },
  });

  useEffect(() => {
    return () => {
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    };
  }, []);

  const remove = useMutation({
    mutationFn: () => tasksApi.remove(taskId),
    onSuccess: () => {
      refreshAllTaskQueries();
      onClose?.();
    },
    onError: (err) => {
      const msg =
        err?.response?.data?.message || "Couldn't delete task — try again.";
      // eslint-disable-next-line no-alert
      alert(msg);
    },
  });

  if (!taskId) return null;

  const task = taskQ.data?.data?.task;

  const isReporter =
    !!task && String(task.reporter?._id || task.reporter || "") === String(user?.id);
  const isAssignee =
    !!task &&
    (task.assignees || []).some(
      (a) => String(a._id || a) === String(user?.id),
    );
  const canEdit = isAdmin || isReporter || isAssignee;
  const canDelete = isAdmin || isReporter || isAssignee;
  const isCompleted = task?.status === "completed";

  const markComplete = () => update.mutate({ status: "completed" });
  const reopen = () => update.mutate({ status: "in_progress" });

  return (
    <div className="fixed inset-y-0 right-0 z-40 flex w-full max-w-xl flex-col border-l border-slate-200 bg-white shadow-2xl">
      <header className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Task
        </span>
        <div className="flex items-center gap-3">
          <PresenceStack taskId={taskId} />
          <button
            onClick={onClose}
            className="rounded p-1 text-slate-400 hover:bg-slate-100"
          >
            <X size={16} />
          </button>
        </div>
      </header>

      {taskQ.isLoading || !task ? (
        <div className="flex flex-1 items-center justify-center">
          <Spinner />
        </div>
      ) : (
        <>
          <div className="border-b border-slate-100 px-4 py-3">
            <h2 className="text-lg font-semibold text-slate-900">
              {task.title}
            </h2>
            {task.project ? (
              <p className="mt-0.5 text-xs text-slate-500">
                {task.project.name}
              </p>
            ) : null}
          </div>

          <nav className="flex gap-1 border-b border-slate-100 px-2 pt-2">
            {["details", "comments", "attachments", "activity"].map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`rounded-t-md px-3 py-1.5 text-xs font-medium capitalize ${tab === t ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
              >
                {t}
              </button>
            ))}
          </nav>

          <div className="flex-1 overflow-y-auto p-4">
            {tab === "details" && (
              <DetailsTab task={task} update={update.mutate} isAdmin={isAdmin} />
            )}
            {tab === "comments" && <CommentsTab taskId={taskId} />}
            {tab === "attachments" && <Attachments task={task} />}
            {tab === "activity" && <ActivityTab taskId={taskId} />}
          </div>

          <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-3">
            <div className="flex items-center gap-2">
              {canDelete ? (
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => {
                    if (
                      confirm(
                        isReporter && !isAdmin
                          ? "Delete this task you created?"
                          : "Delete this task?",
                      )
                    )
                      remove.mutate();
                  }}
                >
                  <Trash2 size={14} /> Delete
                </Button>
              ) : (
                <span className="text-[11px] text-slate-400">
                  Only the reporter, assignees, or admins can delete this task
                </span>
              )}

              {canEdit && !isCompleted ? (
                <Button
                  variant="success"
                  size="sm"
                  onClick={markComplete}
                  loading={update.isPending}
                >
                  <CheckCircle2 size={14} /> Mark complete
                </Button>
              ) : null}

              {canEdit && isCompleted ? (
                <Button size="sm" variant="secondary" onClick={reopen}>
                  <RotateCcw size={14} /> Reopen
                </Button>
              ) : null}
            </div>

            <SaveIndicator
              isSaving={update.isPending}
              savedAt={savedAt}
              updatedAt={task.updatedAt}
              completionDate={task.completionDate}
              isCompleted={isCompleted}
            />
          </footer>
        </>
      )}
    </div>
  );
}

function SaveIndicator({ isSaving, savedAt, updatedAt, completionDate, isCompleted }) {
  if (isSaving) {
    return (
      <span className="text-[11px] font-medium text-slate-500">Saving…</span>
    );
  }
  if (savedAt) {
    return (
      <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-600">
        <Check size={12} /> Saved
      </span>
    );
  }
  if (isCompleted && completionDate) {
    return (
      <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-700">
        <CheckCircle2 size={12} />
        Completed {formatDistanceToNow(new Date(completionDate), { addSuffix: true })}
      </span>
    );
  }
  return (
    <span className="text-[11px] text-slate-400">
      Updated {format(new Date(updatedAt), "PP p")}
    </span>
  );
}

function DetailsTab({ task, update, isAdmin }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description || "");
  const [aiLoading, setAiLoading] = useState(false);
  const [suggestedSubtasks, setSuggestedSubtasks] = useState([]);
  const [creatingSubtasks, setCreatingSubtasks] = useState(false);
  const [delayRisk, setDelayRisk] = useState(task.aiMeta?.delayRisk || null);

  useEffect(() => {
    setTitle(task.title);
    setDescription(task.description || "");
    setDelayRisk(task.aiMeta?.delayRisk || null);
  }, [task._id, task.aiMeta?.delayRisk?.scoredAt]);

  // C: Auto-compute delay risk when the drawer opens, if it hasn't been
  // scored within the last hour. Cheap heuristic call (deterministic + tiny
  // LLM reason); the result lands on task.aiMeta.delayRisk so subsequent
  // opens skip the recompute.
  useEffect(() => {
    if (!task?._id) return;
    const last = task.aiMeta?.delayRisk?.scoredAt
      ? new Date(task.aiMeta.delayRisk.scoredAt).getTime()
      : 0;
    const stale = Date.now() - last > 60 * 60 * 1000; // 1h
    if (!stale && task.aiMeta?.delayRisk) return;

    let cancelled = false;
    aiApi
      .scoreDelay(task._id)
      .then((res) => {
        if (cancelled) return;
        if (res?.data) setDelayRisk(res.data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [task._id]);

  const save = (patch) => update(patch);

  const generateSubtasks = async () => {
    setAiLoading(true);
    try {
      const res = await aiApi.subtasks(title, description);
      setSuggestedSubtasks(res.data?.subtasks || []);
    } finally {
      setAiLoading(false);
    }
  };

  // A: Persist every suggested subtask as a real child task with parent=this.
  // Sequential to keep activity-feed entries readable; for typical N=3-7
  // subtasks the UX delta vs Promise.all is negligible.
  const createAllSubtasks = async () => {
    if (!suggestedSubtasks.length) return;
    setCreatingSubtasks(true);
    try {
      const projectId = task.project?._id || task.project;
      for (const subtaskTitle of suggestedSubtasks) {
        await tasksApi.create({
          project: projectId,
          title: subtaskTitle,
          parent: task._id,
          status: "todo",
          priority: task.priority || "medium",
        });
      }
      setSuggestedSubtasks([]);
      qc.invalidateQueries({ queryKey: ["task", task._id] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["all-tasks"] });
    } catch (e) {
      // eslint-disable-next-line no-alert
      alert(e?.response?.data?.message || "Failed to create subtasks");
    } finally {
      setCreatingSubtasks(false);
    }
  };

  return (
    <div className="space-y-4">
      <Input
        label="Title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={() => title !== task.title && save({ title })}
      />
      <Textarea
        label="Description"
        rows={5}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        onBlur={() =>
          description !== (task.description || "") && save({ description })
        }
      />

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">
            Status
          </span>
          <select
            value={task.status}
            onChange={(e) => save({ status: e.target.value })}
            className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
          >
            {STATUS_ORDER.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">
            Priority
          </span>
          <select
            value={task.priority}
            onChange={(e) => save({ priority: e.target.value })}
            className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
          >
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Input
          label="Due date"
          type="date"
          value={task.dueDate ? task.dueDate.slice(0, 10) : ""}
          onChange={(e) =>
            save({
              dueDate: e.target.value ? new Date(e.target.value).toISOString() : null,
            })
          }
        />
        <Input
          label="Estimated hours"
          type="number"
          min="0"
          value={task.estimatedHours || 0}
          onChange={(e) => save({ estimatedHours: Number(e.target.value) })}
        />
      </div>

      <MilestonePicker
        task={task}
        onChange={(milestoneId) => save({ milestone: milestoneId })}
      />

      <AssigneePicker task={task} save={save} isAdmin={isAdmin} />

      <DependencyManager task={task} isAdmin={isAdmin} />

      <TimerWidget taskId={task._id} />

      <section className="rounded-md border border-slate-100 bg-slate-50 p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-slate-700">
            AI subtask suggestions
          </span>
          <div className="flex items-center gap-1.5">
            {suggestedSubtasks.length > 0 ? (
              <Button
                size="sm"
                variant="success"
                onClick={createAllSubtasks}
                loading={creatingSubtasks}
              >
                Create {suggestedSubtasks.length}
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="secondary"
              onClick={generateSubtasks}
              loading={aiLoading}
            >
              {suggestedSubtasks.length > 0 ? "Re-suggest" : "Suggest"}
            </Button>
          </div>
        </div>
        {suggestedSubtasks.length > 0 ? (
          <>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-slate-700">
              {suggestedSubtasks.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
            <p className="mt-2 text-[10px] text-slate-500">
              "Create {suggestedSubtasks.length}" persists each as a child task
              under this one. They'll appear on the Kanban as separate cards.
            </p>
          </>
        ) : (
          <p className="mt-1 text-[11px] text-slate-500">
            Generate candidate subtasks from the task title + description.
            Requires `DEEPSEEK_API_KEY` to be configured on the backend.
          </p>
        )}
      </section>

      {delayRisk?.label ? (
        <section className="rounded-md border border-slate-100 bg-white p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs">
              <span className="font-semibold text-slate-700">AI delay risk</span>
              <Badge
                tone={
                  delayRisk.label === "high"
                    ? "red"
                    : delayRisk.label === "medium"
                      ? "amber"
                      : "emerald"
                }
              >
                {delayRisk.label}
              </Badge>
              <span className="text-slate-400">score {delayRisk.score}</span>
            </div>
            <button
              type="button"
              onClick={() => {
                aiApi
                  .scoreDelay(task._id)
                  .then((res) => res?.data && setDelayRisk(res.data));
              }}
              className="text-[10px] text-slate-500 hover:text-slate-800"
              title="Recompute"
            >
              Recompute
            </button>
          </div>
          {delayRisk.reason ? (
            <p className="mt-1 text-[11px] text-slate-600">{delayRisk.reason}</p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function CommentsTab({ taskId }) {
  const qc = useQueryClient();
  const [body, setBody] = useState("");
  const [replyOpen, setReplyOpen] = useState(null); // root comment id or null
  // Mention IDs collected from MentionInput when the user picks an autocomplete
  // suggestion. Sent to the backend so we don't rely on regex-resolution alone
  // (which would be ambiguous for users with similar names).
  const [mentionIds, setMentionIds] = useState(new Set());
  const addMentionId = useCallback(
    (id) =>
      setMentionIds((prev) => {
        if (prev.has(id)) return prev;
        const next = new Set(prev);
        next.add(id);
        return next;
      }),
    [],
  );

  const commentsQ = useQuery({
    queryKey: ["comments", taskId],
    queryFn: () => tasksApi.listComments(taskId, { limit: 200 }),
  });

  const add = useMutation({
    mutationFn: ({ text, parent, mentions }) =>
      parent
        ? tasksApi.addReply(taskId, text, parent, mentions)
        : tasksApi.addComment(taskId, text, mentions),
    onSuccess: () => {
      setBody("");
      setReplyOpen(null);
      setMentionIds(new Set());
      // Bug fix: previously only invalidated ["comments"]. The Activity tab
      // uses key ["activity", taskId] and was never refetching when a new
      // "commented" / "mentioned" entry was logged server-side. Refresh both
      // here so the user sees activity update in real time.
      qc.invalidateQueries({ queryKey: ["comments", taskId] });
      qc.invalidateQueries({ queryKey: ["activity", taskId] });
      // Mentioned users get a `task_mentioned` notification — the bell + toast
      // already pick it up via socket on their side.
    },
    onError: (err) => {
      // eslint-disable-next-line no-alert
      alert(
        err?.response?.data?.message ||
          `Couldn't post comment (${err?.response?.status || "network error"}).`,
      );
    },
  });

  const submit = useCallback(
    ({ parent } = {}) => {
      const text = body.trim();
      if (!text) return;
      add.mutate({ text, parent, mentions: [...mentionIds] });
    },
    [body, mentionIds, add],
  );

  const items = commentsQ.data?.data?.items || [];

  // Backend collapses replies-to-replies to the same root parent, so the
  // tree is at most one level deep — a flat group-by suffices.
  const { roots, repliesByRoot } = useMemo(() => {
    const r = [];
    const byParent = new Map();
    for (const c of items) {
      if (c.parent) {
        const key = String(c.parent);
        if (!byParent.has(key)) byParent.set(key, []);
        byParent.get(key).push(c);
      } else {
        r.push(c);
      }
    }
    return { roots: r, repliesByRoot: byParent };
  }, [items]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto">
        {roots.length === 0 ? (
          <p className="text-xs text-slate-400">No comments yet.</p>
        ) : (
          roots.map((c) => {
            const replies = repliesByRoot.get(String(c._id)) || [];
            return (
              <div key={c._id} className="space-y-2">
                <CommentItem comment={c} />
                {replies.length > 0 && (
                  <div className="ml-7 space-y-2 border-l border-slate-100 pl-3">
                    {replies.map((r) => (
                      <CommentItem key={r._id} comment={r} small />
                    ))}
                  </div>
                )}
                <div className="ml-7">
                  <button
                    type="button"
                    onClick={() =>
                      setReplyOpen(replyOpen === c._id ? null : c._id)
                    }
                    className="text-[10px] font-medium text-slate-500 hover:text-slate-800"
                  >
                    {replyOpen === c._id ? "Cancel" : "Reply"}
                  </button>
                  {replyOpen === c._id && (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        submit({ parent: c._id });
                      }}
                      className="mt-1.5 flex gap-2"
                    >
                      <MentionInput
                        value={body}
                        onChange={setBody}
                        onMentionAdded={addMentionId}
                        onSubmit={() => submit({ parent: c._id })}
                        placeholder={`Reply to ${c.author?.name || ""}… use @ to tag`}
                        autoFocus
                      />
                      <Button
                        type="submit"
                        size="sm"
                        loading={add.isPending && replyOpen === c._id}
                      >
                        <Send size={12} />
                      </Button>
                    </form>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (replyOpen) return; // replies use their own form
          submit();
        }}
        className="mt-3 flex gap-2 border-t border-slate-100 pt-3"
      >
        <MentionInput
          value={replyOpen ? "" : body}
          disabled={!!replyOpen}
          onChange={setBody}
          onMentionAdded={addMentionId}
          onSubmit={() => submit()}
          placeholder={
            replyOpen
              ? "Replying above — close it to comment on the task"
              : "Write a comment… use @ to tag a teammate"
          }
        />
        <Button
          type="submit"
          size="sm"
          loading={add.isPending && !replyOpen}
          disabled={!!replyOpen}
        >
          <Send size={14} />
        </Button>
      </form>
    </div>
  );
}

function CommentItem({ comment, small = false }) {
  return (
    <article className="flex gap-2">
      <Avatar
        name={comment.author?.name || "?"}
        src={comment.author?.avatar}
        size={small ? 18 : undefined}
      />
      <div className="flex-1">
        <div className="flex items-baseline gap-2">
          <span className={`font-semibold text-slate-800 ${small ? "text-[11px]" : "text-xs"}`}>
            {comment.author?.name}
          </span>
          <span className="text-[10px] text-slate-400">
            {format(new Date(comment.createdAt), "PP p")}
          </span>
          {comment.editedAt ? (
            <span className="text-[10px] text-slate-400">(edited)</span>
          ) : null}
        </div>
        <p className={`mt-0.5 whitespace-pre-wrap text-slate-700 ${small ? "text-[11px]" : "text-xs"}`}>
          {comment.body}
        </p>
      </div>
    </article>
  );
}

function AssigneePicker({ task, save, isAdmin }) {
  const [picking, setPicking] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiRanked, setAiRanked] = useState(null);

  // Project members come from the cached project query (populated server-side)
  const projectId = task.project?._id || task.project;
  const projectQ = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => projectsApi.get(projectId),
    enabled: !!projectId,
  });
  const allProjectMembers = projectQ.data?.data?.project?.members || [];

  const assignedIds = useMemo(
    () => new Set((task.assignees || []).map((a) => String(a._id || a))),
    [task.assignees],
  );
  const candidates = useMemo(
    () => allProjectMembers.filter((u) => !assignedIds.has(String(u._id))),
    [allProjectMembers, assignedIds],
  );

  const update = (nextIds) => {
    save({ assignees: nextIds });
  };

  const add = (userId) => {
    update([...assignedIds, userId]);
    setPicking(false);
  };
  const remove = (userId) => {
    update([...assignedIds].filter((id) => id !== String(userId)));
  };

  const aiSuggest = async () => {
    setAiBusy(true);
    setAiRanked(null);
    try {
      const res = await aiApi.suggestAssignee(task._id);
      setAiRanked(res.data?.ranked || []);
    } finally {
      setAiBusy(false);
    }
  };

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-medium text-slate-600">Assignees</span>
        {isAdmin ? (
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={aiSuggest}
              disabled={aiBusy}
              className="flex items-center gap-1 rounded-md border border-slate-200 px-2 py-0.5 text-[11px] text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              title="Ask AI who should own this task"
            >
              <Sparkles size={11} />
              {aiBusy ? "…" : "AI suggest"}
            </button>
            <button
              type="button"
              onClick={() => setPicking((v) => !v)}
              className="flex items-center gap-1 rounded-md bg-slate-900 px-2 py-0.5 text-[11px] font-medium text-white hover:bg-slate-800"
            >
              <UserPlus size={11} />
              {picking ? "Done" : "Add"}
            </button>
          </div>
        ) : (
          <span className="text-[11px] text-slate-400">Admin-managed</span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {(task.assignees || []).length === 0 && !picking ? (
          <span className="text-xs text-slate-400">Unassigned</span>
        ) : null}
        {(task.assignees || []).map((u) => (
          <div
            key={u._id || u}
            className="group inline-flex items-center gap-1 rounded-full bg-slate-100 py-0.5 pl-0.5 pr-2 text-xs"
          >
            <Avatar name={u.name || "?"} src={u.avatar} size={20} />
            <span>{u.name || "?"}</span>
            {isAdmin && (
              <button
                onClick={() => remove(u._id || u)}
                className="ml-1 rounded-full p-0.5 text-slate-400 opacity-0 transition group-hover:opacity-100 hover:bg-red-100 hover:text-red-600"
                aria-label={`Remove ${u.name}`}
              >
                <X size={10} />
              </button>
            )}
          </div>
        ))}
      </div>

      {picking && isAdmin && (
        <div className="mt-2 rounded-md border border-slate-100 bg-slate-50 p-2">
          {projectQ.isLoading ? (
            <div className="text-[11px] text-slate-400">Loading members…</div>
          ) : candidates.length === 0 ? (
            <div className="text-[11px] text-slate-400">
              All project members are already assigned. Add more people on the
              <strong> Members </strong>panel above.
            </div>
          ) : (
            <ul className="max-h-44 space-y-1 overflow-y-auto">
              {candidates.map((u) => (
                <li
                  key={u._id}
                  className="flex items-center justify-between rounded-md bg-white px-2 py-1"
                >
                  <div className="flex items-center gap-2">
                    <Avatar name={u.name} src={u.avatar} size={18} />
                    <span className="text-[11px] text-slate-800">{u.name}</span>
                  </div>
                  <button
                    onClick={() => add(u._id)}
                    className="rounded-md bg-slate-900 px-2 py-0.5 text-[11px] font-medium text-white hover:bg-slate-800"
                  >
                    Add
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {aiRanked && aiRanked.length > 0 && isAdmin && (
        <div className="mt-2 rounded-md border border-emerald-100 bg-emerald-50/50 p-2">
          <div className="mb-1 flex items-center justify-between text-[11px] font-medium text-emerald-800">
            <span>AI recommendation</span>
            <button
              onClick={() => setAiRanked(null)}
              className="text-emerald-600 hover:text-emerald-900"
              aria-label="Dismiss"
            >
              <X size={11} />
            </button>
          </div>
          <ul className="space-y-1">
            {aiRanked.slice(0, 3).map((r) => {
              const member = allProjectMembers.find(
                (m) => m.name === r.name,
              );
              const already = member && assignedIds.has(String(member._id));
              return (
                <li
                  key={r.name}
                  className="flex items-center justify-between rounded bg-white px-2 py-1"
                >
                  <div>
                    <div className="text-[11px] font-medium text-slate-800">
                      {r.name}
                    </div>
                    {r.reason && (
                      <div className="text-[10px] text-slate-500">
                        {r.reason}
                      </div>
                    )}
                  </div>
                  {member && !already ? (
                    <button
                      onClick={() => add(member._id)}
                      className="rounded bg-emerald-600 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-emerald-700"
                    >
                      Assign
                    </button>
                  ) : (
                    <span className="text-[10px] text-slate-400">
                      {already ? "assigned" : "—"}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

function ActivityTab({ taskId }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["activity", taskId],
    queryFn: () => tasksApi.listActivity(taskId),
  });

  // Bug fix: this tab used to show stale data. When status changes / comments
  // / Mark Complete happened from elsewhere (Kanban DnD, another browser tab,
  // another user), the activity list never refetched. Listen for the
  // taskUpdated socket event and refresh whenever this task is the subject.
  useSocketEvent(
    "taskUpdated",
    useCallback(
      (payload) => {
        if (!payload || String(payload.taskId) === String(taskId)) {
          qc.invalidateQueries({ queryKey: ["activity", taskId] });
        }
      },
      [qc, taskId],
    ),
  );

  const items = q.data?.data?.items || [];
  if (!items.length)
    return <p className="text-xs text-slate-400">No activity yet.</p>;
  return (
    <ol className="relative space-y-3 pl-4">
      {items.map((a) => (
        <li key={a._id} className="relative">
          <span className="absolute -left-4 top-1.5 h-2 w-2 rounded-full bg-slate-300" />
          <div className="text-xs text-slate-700">
            <strong>{a.actor?.name || "system"}</strong>{" "}
            <span className="text-slate-500">
              {a.message || a.type.replace(/_/g, " ")}
            </span>
          </div>
          <div className="text-[10px] text-slate-400">
            {format(new Date(a.createdAt), "PP p")}
          </div>
        </li>
      ))}
    </ol>
  );
}
