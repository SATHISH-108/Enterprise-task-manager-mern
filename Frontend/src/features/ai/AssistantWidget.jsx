import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bot, Send, X, Sparkles, CheckCircle2 } from "lucide-react";
import { useAuth } from "../../store/authStore.js";
import { aiApi, projectsApi, tasksApi } from "../../shared/api/endpoints.js";

const SUGGESTIONS = [
  "Which tasks are overdue?",
  "What's due in the next 3 days?",
  "Summarize my active workload",
  "Create a task for fixing the login bug",
];

export default function AssistantWidget() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, open]);

  if (!user) return null;

  const send = async (text) => {
    const trimmed = (text ?? input).trim();
    if (!trimmed || busy) return;
    const next = [...messages, { role: "user", content: trimmed }];
    setMessages(next);
    setInput("");
    setBusy(true);
    try {
      const { data } = await aiApi.chat(trimmed, next);
      setMessages([
        ...next,
        {
          role: "assistant",
          content: data?.reply || "(no response)",
          action: data?.action,
        },
      ]);
    } catch (e) {
      setMessages([
        ...next,
        {
          role: "assistant",
          content:
            e.response?.data?.message ||
            "I couldn't reach the assistant. Try again in a moment.",
        },
      ]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-slate-900 text-white shadow-lg transition hover:scale-105 hover:bg-slate-800"
          aria-label="Open assistant"
        >
          <Bot size={20} />
        </button>
      )}

      {open && (
        <div className="fixed bottom-5 right-5 z-40 flex h-[520px] w-[380px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
          <header className="flex items-center justify-between border-b border-slate-100 bg-slate-900 px-4 py-3 text-white">
            <div className="flex items-center gap-2">
              <Sparkles size={14} />
              <span className="text-sm font-semibold">Assistant</span>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="rounded p-1 hover:bg-slate-700"
              aria-label="Close"
            >
              <X size={16} />
            </button>
          </header>

          <div
            ref={scrollRef}
            className="flex-1 space-y-3 overflow-y-auto bg-slate-50 px-3 py-3"
          >
            {messages.length === 0 ? (
              <div className="rounded-md border border-slate-100 bg-white p-3">
                <div className="text-xs font-medium text-slate-700">
                  Ask me anything about your work.
                </div>
                <div className="mt-1 text-[11px] text-slate-500">
                  I can see your active tasks, due dates, and project state.
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => send(s)}
                      className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-700 hover:bg-slate-100"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((m, i) => (
                <div
                  key={i}
                  className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-xs ${
                      m.role === "user"
                        ? "bg-slate-900 text-white"
                        : "border border-slate-100 bg-white text-slate-800"
                    }`}
                  >
                    {m.content}
                    {m.action?.type === "create_task" && (
                      <CreateTaskCard task={m.action.task} />
                    )}
                  </div>
                </div>
              ))
            )}
            {busy && (
              <div className="flex justify-start">
                <div className="rounded-lg border border-slate-100 bg-white px-3 py-2 text-xs text-slate-400">
                  <span className="inline-flex gap-1">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.3s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.15s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" />
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* CreateTaskCard rendered inline above this */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
            className="flex items-center gap-2 border-t border-slate-100 bg-white px-3 py-2"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask the assistant…"
              className="flex-1 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs focus:border-slate-400 focus:outline-none"
              disabled={busy}
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              className="flex h-7 w-7 items-center justify-center rounded-md bg-slate-900 text-white disabled:opacity-40"
              aria-label="Send"
            >
              <Send size={12} />
            </button>
          </form>
        </div>
      )}
    </>
  );
}

function CreateTaskCard({ task }) {
  const projects = useQuery({
    queryKey: ["projects"],
    queryFn: () => projectsApi.list(),
  });
  const options = projects.data?.data?.projects || [];

  const [projectId, setProjectId] = useState("");
  const [title, setTitle] = useState(task.title || "");
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!projectId && options.length > 0) setProjectId(options[0]._id);
  }, [options, projectId]);

  const create = async () => {
    if (!projectId || !title.trim() || creating) return;
    setCreating(true);
    setError(null);
    try {
      const res = await tasksApi.create({
        project: projectId,
        title: title.trim(),
        description: task.description || "",
        priority: task.priority || "medium",
        estimatedHours: task.estimatedHours || 2,
      });
      setCreated(res?.data?.task);
    } catch (e) {
      setError(
        e.response?.data?.message || "Failed to create task. Try again.",
      );
    } finally {
      setCreating(false);
    }
  };

  if (created) {
    return (
      <div className="mt-2 flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-[11px] text-emerald-800">
        <CheckCircle2 size={12} /> Task created — "{created.title}"
      </div>
    );
  }

  return (
    <div className="mt-2 rounded-md border border-slate-200 bg-slate-50 p-2 text-[11px] text-slate-700">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="mb-1.5 w-full rounded border border-slate-200 bg-white px-2 py-1 text-[11px]"
      />
      <select
        value={projectId}
        onChange={(e) => setProjectId(e.target.value)}
        className="mb-1.5 w-full rounded border border-slate-200 bg-white px-2 py-1 text-[11px]"
      >
        {options.length === 0 ? (
          <option value="">No projects yet — create one first</option>
        ) : (
          options.map((p) => (
            <option key={p._id} value={p._id}>
              {p.name}
            </option>
          ))
        )}
      </select>
      <div className="mb-1.5 flex flex-wrap gap-1 text-[10px]">
        <span className="rounded-full bg-slate-200 px-1.5 py-0.5">
          {task.priority || "medium"}
        </span>
        <span className="rounded-full bg-slate-200 px-1.5 py-0.5">
          ~{task.estimatedHours || 2}h
        </span>
      </div>
      {task.description && (
        <p className="mb-1.5 text-[10px] text-slate-500 line-clamp-3">
          {task.description}
        </p>
      )}
      {error && (
        <div className="mb-1.5 rounded bg-red-50 px-1.5 py-1 text-[10px] text-red-700">
          {error}
        </div>
      )}
      <button
        onClick={create}
        disabled={creating || !projectId || !title.trim()}
        className="w-full rounded bg-slate-900 px-2 py-1 text-[11px] font-medium text-white disabled:opacity-40"
      >
        {creating ? "Creating…" : "Create task"}
      </button>
    </div>
  );
}
