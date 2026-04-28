import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { UserPlus, X, RefreshCcw } from "lucide-react";
import { projectsApi, usersApi } from "../../shared/api/endpoints.js";
import { useAuth } from "../../store/authStore.js";
import Avatar from "../../shared/components/Avatar.jsx";

export default function ProjectMembers({ project }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState(null);

  const allUsers = useQuery({
    queryKey: ["users", "for-project-pick"],
    queryFn: () => usersApi.list({ limit: 200 }),
    enabled: picking,
  });

  const memberIds = useMemo(
    () => new Set((project.members || []).map((m) => String(m._id || m))),
    [project.members],
  );

  const candidates = useMemo(() => {
    const items = allUsers.data?.data?.items || [];
    return items.filter((u) => !memberIds.has(String(u._id)));
  }, [allUsers.data, memberIds]);

  const isAdminOrLead =
    user?.role === "admin" ||
    String(project.team?.lead?._id || project.team?.lead) === String(user?.id);

  const onError = (e) =>
    setError(e?.response?.data?.message || e?.message || "Action failed");

  const add = useMutation({
    mutationFn: (userId) => projectsApi.addMember(project._id, userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project", project._id] });
      qc.invalidateQueries({ queryKey: ["tasks", "project", project._id] });
      setError(null);
    },
    onError,
  });

  const remove = useMutation({
    mutationFn: (userId) => projectsApi.removeMember(project._id, userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project", project._id] });
      qc.invalidateQueries({ queryKey: ["tasks", "project", project._id] });
      setError(null);
    },
    onError,
  });

  const sync = useMutation({
    mutationFn: () => projectsApi.syncMembers(project._id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project", project._id] });
      qc.invalidateQueries({ queryKey: ["tasks", "project", project._id] });
      setError(null);
    },
    onError,
  });

  return (
    <section className="mb-3 rounded-lg border border-slate-100 bg-white p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
            Members
          </span>
          <span className="text-[11px] text-slate-400">
            ({(project.members || []).length})
          </span>
        </div>
        {isAdminOrLead && (
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => sync.mutate()}
              disabled={sync.isPending}
              className="flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              title="Add every team member to this project"
            >
              <RefreshCcw size={11} />
              {sync.isPending ? "Syncing…" : "Sync from team"}
            </button>
            <button
              onClick={() => setPicking((v) => !v)}
              className="flex items-center gap-1 rounded-md bg-slate-900 px-2 py-1 text-[11px] font-medium text-white hover:bg-slate-800"
            >
              <UserPlus size={11} />
              {picking ? "Done" : "Add member"}
            </button>
          </div>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {(project.members || []).length === 0 ? (
          <span className="text-[11px] text-slate-400">No members yet.</span>
        ) : (
          (project.members || []).map((m) => (
            <div
              key={m._id || m}
              className="group flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 py-0.5 pl-0.5 pr-2 text-[11px] text-slate-700"
            >
              <Avatar name={m.name || "?"} src={m.avatar} size={20} />
              <span>{m.name || "?"}</span>
              {isAdminOrLead && (
                <button
                  onClick={() => {
                    if (window.confirm(`Remove ${m.name} from this project?`))
                      remove.mutate(m._id || m);
                  }}
                  className="ml-1 rounded-full p-0.5 text-slate-400 opacity-0 transition group-hover:opacity-100 hover:bg-red-100 hover:text-red-600"
                  aria-label={`Remove ${m.name}`}
                >
                  <X size={10} />
                </button>
              )}
            </div>
          ))
        )}
      </div>

      {picking && isAdminOrLead && (
        <div className="mt-3 rounded-md border border-slate-100 bg-slate-50 p-2">
          <div className="text-[11px] font-medium text-slate-600">
            Add a user to this project
          </div>
          {allUsers.isLoading ? (
            <div className="mt-2 text-[11px] text-slate-400">Loading users…</div>
          ) : candidates.length === 0 ? (
            <div className="mt-2 text-[11px] text-slate-400">
              Everyone is already a member.
            </div>
          ) : (
            <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto">
              {candidates.map((u) => (
                <li
                  key={u._id}
                  className="flex items-center justify-between rounded-md bg-white px-2 py-1"
                >
                  <div className="flex items-center gap-2">
                    <Avatar name={u.name} src={u.avatar} size={20} />
                    <div>
                      <div className="text-[11px] font-medium text-slate-800">
                        {u.name}
                      </div>
                      <div className="text-[10px] text-slate-500">{u.email}</div>
                    </div>
                  </div>
                  <button
                    onClick={() => add.mutate(u._id)}
                    disabled={add.isPending}
                    className="rounded-md bg-slate-900 px-2 py-0.5 text-[11px] font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                  >
                    Add
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {error && (
        <div className="mt-2 rounded-md border border-red-200 bg-red-50 p-1.5 text-[11px] text-red-700">
          {error}
        </div>
      )}
    </section>
  );
}
