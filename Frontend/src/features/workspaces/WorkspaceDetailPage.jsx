import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Building2, Plus, X, Users } from "lucide-react";
import { workspacesApi } from "./api.js";
import { teamsApi } from "../../shared/api/endpoints.js";
import { useAuth } from "../../store/authStore.js";
import Spinner from "../../shared/components/Spinner.jsx";
import Avatar from "../../shared/components/Avatar.jsx";
import Badge from "../../shared/components/Badge.jsx";
import Button from "../../shared/components/Button.jsx";

export default function WorkspaceDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["workspace", id],
    queryFn: () => workspacesApi.get(id),
    enabled: !!id,
  });

  const allTeams = useQuery({
    queryKey: ["teams"],
    queryFn: () => teamsApi.list(),
  });

  const attach = useMutation({
    mutationFn: (teamId) => workspacesApi.attachTeam(id, teamId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workspace", id] });
      qc.invalidateQueries({ queryKey: ["workspaces"] });
      qc.invalidateQueries({ queryKey: ["teams"] });
    },
  });
  const detach = useMutation({
    mutationFn: (teamId) => workspacesApi.detachTeam(id, teamId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workspace", id] });
      qc.invalidateQueries({ queryKey: ["workspaces"] });
      qc.invalidateQueries({ queryKey: ["teams"] });
    },
  });

  if (q.isLoading) {
    return (
      <div className="flex h-60 items-center justify-center">
        <Spinner />
      </div>
    );
  }
  const ws = q.data?.data?.workspace;
  const teams = q.data?.data?.teams || [];
  if (!ws) return null;

  const isAdmin = user?.role === "admin";
  const isOwner =
    isAdmin ||
    (ws.owners || []).some((o) => String(o._id) === String(user?.id));
  const allTeamItems = allTeams.data?.data?.teams || [];
  const inWsIds = new Set(teams.map((t) => String(t._id)));
  const attachable = allTeamItems.filter((t) => !inWsIds.has(String(t._id)));

  return (
    <main className="mx-auto max-w-5xl space-y-4 p-6">
      <header>
        <Link
          to="/workspaces"
          className="text-[11px] font-medium uppercase tracking-wide text-slate-500 hover:text-slate-700"
        >
          ← Workspaces
        </Link>
        <div className="mt-1 flex items-end justify-between gap-2">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-semibold text-slate-900">
              <Building2 size={18} className="text-slate-500" />
              {ws.name}
            </h1>
            {ws.description && (
              <p className="mt-1 text-xs text-slate-500">{ws.description}</p>
            )}
          </div>
          {isOwner && (
            <Badge tone="amber">You're an owner</Badge>
          )}
        </div>
      </header>

      <section className="rounded-lg border border-slate-100 bg-white p-4">
        <header className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-600">
            <Users size={13} /> Teams in this workspace ({teams.length})
          </h2>
        </header>
        {teams.length === 0 ? (
          <p className="py-4 text-center text-xs text-slate-400">
            No teams here yet.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {teams.map((t) => (
              <li key={t._id} className="flex items-center justify-between py-2">
                <div className="flex min-w-0 items-center gap-2">
                  <Link
                    to={`/teams/${t._id}`}
                    className="truncate text-sm font-medium text-slate-800 hover:underline"
                  >
                    {t.name}
                  </Link>
                  <span className="text-[11px] text-slate-500">
                    {(t.members || []).length} members
                  </span>
                </div>
                {isOwner && (
                  <button
                    type="button"
                    onClick={() => detach.mutate(t._id)}
                    className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                    title="Detach from workspace"
                  >
                    <X size={13} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        {isOwner && attachable.length > 0 && (
          <details className="mt-3 rounded border border-slate-100 bg-slate-50 p-2 text-xs">
            <summary className="cursor-pointer font-medium text-slate-700">
              Attach an existing team
            </summary>
            <ul className="mt-2 space-y-1">
              {attachable.map((t) => (
                <li
                  key={t._id}
                  className="flex items-center justify-between rounded bg-white px-2 py-1"
                >
                  <span className="text-slate-700">{t.name}</span>
                  <button
                    type="button"
                    onClick={() => attach.mutate(t._id)}
                    className="flex items-center gap-1 rounded bg-slate-900 px-2 py-0.5 text-[11px] font-medium text-white hover:bg-slate-800"
                  >
                    <Plus size={11} /> Attach
                  </button>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <section className="rounded-lg border border-slate-100 bg-white p-4">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
          Members ({ws.members?.length || 0})
        </h2>
        <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {(ws.members || []).map((m) => (
            <li
              key={m._id}
              className="flex items-center gap-2 rounded bg-slate-50 px-2 py-1.5"
            >
              <Avatar name={m.name || "?"} src={m.avatar} size={22} />
              <div className="min-w-0">
                <div className="truncate text-xs font-medium text-slate-800">
                  {m.name}
                </div>
                <div className="truncate text-[10px] text-slate-500">
                  {m.email}
                </div>
              </div>
              {(ws.owners || []).some(
                (o) => String(o._id) === String(m._id),
              ) && (
                <Badge tone="amber" className="ml-auto">
                  owner
                </Badge>
              )}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
