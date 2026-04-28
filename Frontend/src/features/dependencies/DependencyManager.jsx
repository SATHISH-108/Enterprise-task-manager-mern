import { useEffect, useMemo, useRef, useState } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Link2, Plus, X, Search } from "lucide-react";
import api from "../../shared/api/client.js";
import { tasksApi, usersApi } from "../../shared/api/endpoints.js";
import Badge from "../../shared/components/Badge.jsx";
import Spinner from "../../shared/components/Spinner.jsx";

/**
 * Lists the current dependencies of a task and lets the user add/remove them.
 * The picker searches across every task the user can see (cross-project).
 */
export default function DependencyManager({ task, isAdmin }) {
  const qc = useQueryClient();
  const taskId = task._id;
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState("");

  const depsQ = useQuery({
    queryKey: ["dependencies", taskId],
    queryFn: () => tasksApi.listDependencies(taskId),
    enabled: !!taskId,
  });

  const addDep = useMutation({
    mutationFn: (depId) => tasksApi.addDependency(taskId, depId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dependencies", taskId] });
      qc.invalidateQueries({ queryKey: ["task", taskId] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
    },
  });

  const removeDep = useMutation({
    mutationFn: (depId) =>
      api
        .delete(`/tasks/${taskId}/dependencies/${depId}`)
        .then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dependencies", taskId] });
      qc.invalidateQueries({ queryKey: ["task", taskId] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
    },
  });

  const deps = depsQ.data?.data?.dependencies || [];

  return (
    <section>
      <header className="mb-1 flex items-center justify-between">
        <span className="flex items-center gap-1 text-xs font-medium text-slate-600">
          <Link2 size={11} />
          Dependencies
        </span>
        {!adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex items-center gap-1 rounded border border-slate-200 px-2 py-0.5 text-[11px] text-slate-600 hover:bg-slate-50"
          >
            <Plus size={11} /> Add
          </button>
        )}
      </header>

      {depsQ.isLoading ? (
        <div className="flex h-12 items-center justify-center">
          <Spinner className="h-3 w-3" />
        </div>
      ) : deps.length === 0 ? (
        <p className="text-[11px] text-slate-400">
          No dependencies — this task can start at any time.
        </p>
      ) : (
        <ul className="space-y-1">
          {deps.map((d) => (
            <li
              key={d._id}
              className="flex items-center justify-between rounded border border-slate-100 bg-slate-50/40 px-2 py-1.5"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="truncate font-medium text-slate-800">
                    {d.title}
                  </span>
                  <Badge tone={d.priority}>{d.priority}</Badge>
                </div>
                <div className="text-[10px] text-slate-500">{d.status}</div>
              </div>
              {(isAdmin || true) && (
                <button
                  type="button"
                  onClick={() => removeDep.mutate(d._id)}
                  className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                  title="Remove dependency"
                >
                  <X size={11} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {adding && (
        <DependencyPicker
          excludeTaskId={taskId}
          excludeIds={deps.map((d) => String(d._id))}
          onPick={(depId) => {
            addDep.mutate(depId, { onSuccess: () => setAdding(false) });
          }}
          onClose={() => setAdding(false)}
          q={q}
          setQ={setQ}
          error={addDep.error?.response?.data?.message}
        />
      )}
    </section>
  );
}

function DependencyPicker({ excludeTaskId, excludeIds, onPick, onClose, q, setQ, error }) {
  const inputRef = useRef(null);
  const [debounced, setDebounced] = useState(q);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 200);
    return () => clearTimeout(t);
  }, [q]);

  // `@<name>` is interpreted as "tasks assigned to a user named <name>" —
  // matches the convention used by Linear/Notion/Jira so users aren't stuck
  // staring at "no tasks matching '@Harish CH'" when they meant to filter by
  // assignee. Anything else is a normal title/description/tag search.
  const trimmed = debounced.trim();
  const userQuery =
    trimmed.startsWith("@") ? trimmed.slice(1).trim() : null;

  // Resolve the @-name to user ids first. Skip the lookup when the query is
  // just a bare "@" (no name yet) so we don't fire an unnecessary request.
  const usersQ = useQuery({
    queryKey: ["dep-search-users", userQuery],
    queryFn: () => usersApi.list({ q: userQuery, limit: 5 }),
    enabled: userQuery !== null && userQuery.length > 0,
  });
  const matchedUserIds = useMemo(
    () => (usersQ.data?.data?.items || []).map((u) => String(u._id)),
    [usersQ.data],
  );

  // Always fire the task query — when `debounced` is empty the backend
  // returns recent tasks so the picker is useful the moment it opens.
  // When `@<name>` resolved to a user, filter by that assignee instead of
  // doing a literal text search for "@<name>" (which never matches).
  const search = useQuery({
    queryKey: ["dep-search", debounced, matchedUserIds.join(",")],
    queryFn: () => {
      if (userQuery !== null) {
        // Bare "@" or unmatched name → no point in calling the backend.
        if (matchedUserIds.length === 0) return { data: { items: [] } };
        return tasksApi.list({ assignee: matchedUserIds[0], limit: 15 });
      }
      return tasksApi.list(
        trimmed.length > 0 ? { q: trimmed, limit: 15 } : { limit: 15 },
      );
    },
    // When the @-name search is still resolving, hold off on running the
    // task query so we don't render a "no tasks" flash before the user
    // lookup completes.
    enabled: userQuery === null || userQuery.length === 0 || !usersQ.isLoading,
  });

  const results = useMemo(() => {
    const items = search.data?.data?.items || [];
    return items.filter(
      (t) =>
        String(t._id) !== String(excludeTaskId) &&
        !excludeIds.includes(String(t._id)),
    );
  }, [search.data, excludeTaskId, excludeIds]);

  const isLoading = search.isLoading || usersQ.isLoading;
  const matchedUser =
    userQuery && (usersQ.data?.data?.items || [])[0];

  return (
    <div className="mt-2 rounded-md border border-slate-200 bg-white p-2 shadow-sm">
      <div className="relative">
        <Search
          size={11}
          className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-slate-400"
        />
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search tasks, or @user to filter by assignee…"
          className="w-full rounded border border-slate-200 bg-slate-50 py-1 pl-7 pr-7 text-xs outline-none focus:border-slate-400 focus:bg-white"
        />
        <button
          type="button"
          onClick={onClose}
          className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:bg-slate-100"
          title="Close"
        >
          <X size={11} />
        </button>
      </div>

      {error && (
        <div className="mt-1 rounded bg-red-50 px-2 py-1 text-[10px] text-red-700">
          {error}
        </div>
      )}

      {userQuery !== null && userQuery.length > 0 && matchedUser && (
        <div className="mt-1 px-1 text-[10px] text-slate-500">
          Showing tasks assigned to{" "}
          <span className="font-medium text-slate-700">{matchedUser.name}</span>
        </div>
      )}

      <div className="mt-1.5 max-h-48 overflow-y-auto">
        {isLoading ? (
          <div className="flex justify-center py-2">
            <Spinner className="h-3 w-3" />
          </div>
        ) : results.length === 0 ? (
          <p className="py-3 text-center text-[11px] text-slate-400">
            {userQuery !== null && userQuery.length > 0
              ? matchedUserIds.length === 0
                ? `No user matching "${userQuery}".`
                : `${matchedUser?.name || "That user"} has no tasks to link.`
              : trimmed.length > 0
                ? `No tasks matching "${trimmed}".`
                : "No tasks available to link."}
          </p>
        ) : (
          <ul className="space-y-1">
            {results.map((t) => (
              <li key={t._id}>
                <button
                  type="button"
                  onClick={() => onPick(t._id)}
                  className="flex w-full items-center justify-between gap-2 rounded px-2 py-1 text-left hover:bg-slate-50"
                >
                  <div className="min-w-0">
                    <div className="truncate text-xs text-slate-800">
                      {t.title}
                    </div>
                    <div className="text-[10px] text-slate-500">
                      {t.project?.name || "—"} · {t.status}
                    </div>
                  </div>
                  <Badge tone={t.priority}>{t.priority}</Badge>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
