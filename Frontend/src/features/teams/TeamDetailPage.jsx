import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { UserMinus, UserPlus, CalendarRange } from "lucide-react";
import { teamsApi, usersApi } from "../../shared/api/endpoints.js";
import { useAuth } from "../../store/authStore.js";
import Avatar from "../../shared/components/Avatar.jsx";
import Badge from "../../shared/components/Badge.jsx";
import Button from "../../shared/components/Button.jsx";
import Input from "../../shared/components/Input.jsx";
import Spinner from "../../shared/components/Spinner.jsx";

export default function TeamDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const qc = useQueryClient();

  const team = useQuery({
    queryKey: ["team", id],
    queryFn: () => teamsApi.get(id),
    enabled: !!id,
  });

  const t = team.data?.data?.team;
  const canManage =
    user?.role === "admin" || (t?.lead && String(t.lead._id) === String(user?.id));

  const add = useMutation({
    mutationFn: (userId) => teamsApi.addMember(id, userId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["team", id] }),
  });
  const remove = useMutation({
    mutationFn: (userId) => teamsApi.removeMember(id, userId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["team", id] }),
  });

  if (team.isLoading) {
    return (
      <div className="flex h-60 items-center justify-center">
        <Spinner />
      </div>
    );
  }
  if (!t) return null;

  return (
    <main className="mx-auto max-w-5xl space-y-4 p-6">
      <header>
        <Link
          to="/teams"
          className="text-[11px] font-medium uppercase tracking-wide text-slate-500 hover:text-slate-700"
        >
          ← Teams
        </Link>
        <div className="mt-1 flex items-center justify-between gap-2">
          <h1 className="text-xl font-semibold text-slate-900">{t.name}</h1>
          <div className="flex items-center gap-2">
            <Link
              to={`/teams/${id}/roadmap`}
              className="flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              <CalendarRange size={13} /> Roadmap
            </Link>
            {t.lead ? (
              <Badge tone="slate">
                Lead: {t.lead.name || t.lead.email}
              </Badge>
            ) : null}
          </div>
        </div>
        {t.description ? (
          <p className="mt-1 text-xs text-slate-500">{t.description}</p>
        ) : null}
      </header>

      <section className="rounded-lg border border-slate-100 bg-white p-4">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-600">
          Members ({t.members?.length || 0})
        </h2>
        <ul className="divide-y divide-slate-100">
          {(t.members || []).map((m) => (
            <li
              key={m._id}
              className="flex items-center justify-between gap-2 py-2"
            >
              <div className="flex items-center gap-2">
                <Avatar name={m.name || "?"} src={m.avatar} />
                <div className="text-sm">
                  <div className="font-medium text-slate-800">{m.name}</div>
                  <div className="text-[11px] text-slate-500">{m.email}</div>
                </div>
              </div>
              {canManage && String(m._id) !== String(t.lead?._id) ? (
                <button
                  onClick={() => remove.mutate(m._id)}
                  className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                  title="Remove"
                >
                  <UserMinus size={14} />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      {canManage ? <AddMemberCard teamId={id} onAdd={add.mutate} /> : null}
    </main>
  );
}

function AddMemberCard({ teamId, onAdd }) {
  const [q, setQ] = useState("");
  const users = useQuery({
    queryKey: ["users", q],
    queryFn: () => usersApi.list({ q, limit: 10 }),
    enabled: q.length >= 2,
  });

  const items = users.data?.data?.items || [];

  return (
    <section className="rounded-lg border border-slate-100 bg-white p-4">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-600">
        Add member
      </h2>
      <Input
        placeholder="Search by name or email…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      {q.length >= 2 && (
        <ul className="mt-2 max-h-60 divide-y divide-slate-100 overflow-y-auto rounded-md border border-slate-100">
          {items.length === 0 ? (
            <li className="p-3 text-xs text-slate-500">No matches.</li>
          ) : (
            items.map((u) => (
              <li
                key={u._id}
                className="flex items-center justify-between gap-2 p-2"
              >
                <div className="flex items-center gap-2">
                  <Avatar name={u.name} src={u.avatar} />
                  <div className="text-sm">
                    <div className="text-slate-800">{u.name}</div>
                    <div className="text-[11px] text-slate-500">{u.email}</div>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => onAdd(u._id)}
                >
                  <UserPlus size={14} /> Add
                </Button>
              </li>
            ))
          )}
        </ul>
      )}
    </section>
  );
}
