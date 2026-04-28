import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { projectsApi, teamsApi } from "../../shared/api/endpoints.js";
import Button from "../../shared/components/Button.jsx";
import Modal from "../../shared/components/Modal.jsx";
import Input, { Textarea } from "../../shared/components/Input.jsx";
import Badge from "../../shared/components/Badge.jsx";

export default function ProjectsPage() {
  const [open, setOpen] = useState(false);

  const projects = useQuery({
    queryKey: ["projects"],
    queryFn: () => projectsApi.list(),
  });

  const items = projects.data?.data?.projects || [];

  return (
    <main className="mx-auto max-w-6xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Projects</h1>
          <p className="text-xs text-slate-500">
            Projects group tasks inside a team. Open any project to see its
            Kanban board.
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>+ New project</Button>
      </div>

      {projects.isLoading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
          No projects yet — create one to get started.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((p) => (
            <Link
              key={p._id}
              to={`/projects/${p._id}`}
              className="rounded-lg border border-slate-100 bg-white p-4 shadow-sm transition hover:border-slate-300 hover:shadow"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900">
                  {p.name}
                </h3>
                <Badge tone="slate">{p.status}</Badge>
              </div>
              {p.description ? (
                <p className="mt-1 line-clamp-2 text-xs text-slate-500">
                  {p.description}
                </p>
              ) : null}
              <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500">
                <span>{p.team?.name || "—"}</span>
                <span>{p.members?.length || 0} members</span>
              </div>
            </Link>
          ))}
        </div>
      )}

      <NewProjectModal open={open} onClose={() => setOpen(false)} />
    </main>
  );
}

function NewProjectModal({ open, onClose }) {
  const qc = useQueryClient();
  const [team, setTeam] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState(null);

  const teams = useQuery({
    queryKey: ["teams"],
    queryFn: () => teamsApi.list(),
    enabled: open,
  });

  const teamOptions = teams.data?.data?.teams || [];

  const create = useMutation({
    mutationFn: () => projectsApi.create({ team, name, description }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      setTeam("");
      setName("");
      setDescription("");
      setError(null);
      onClose();
    },
    onError: (err) => {
      setError(
        err?.response?.data?.message || err?.message || "Failed to create project",
      );
    },
  });

  return (
    <Modal open={open} onClose={onClose} title="New project">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          if (team && name.trim()) create.mutate();
        }}
        className="space-y-3"
      >
        {teamOptions.length === 0 && !teams.isLoading && (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
            You don't have any teams yet. Create a team first under{" "}
            <strong>Teams → + New team</strong> (admin role required), then come back.
          </div>
        )}
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">
            Team
          </span>
          <select
            value={team}
            onChange={(e) => setTeam(e.target.value)}
            className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
            required
          >
            <option value="">Select a team…</option>
            {teamOptions.map((t) => (
              <option key={t._id} value={t._id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <Input
          label="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <Textarea
          label="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">
            {error}
          </div>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            loading={create.isPending}
            disabled={teamOptions.length === 0}
          >
            Create
          </Button>
        </div>
      </form>
    </Modal>
  );
}
