import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { teamsApi } from "../../shared/api/endpoints.js";
import { useAuth } from "../../store/authStore.js";
import Button from "../../shared/components/Button.jsx";
import Modal from "../../shared/components/Modal.jsx";
import Input, { Textarea } from "../../shared/components/Input.jsx";
import Avatar from "../../shared/components/Avatar.jsx";

export default function TeamsPage() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const teams = useQuery({
    queryKey: ["teams"],
    queryFn: () => teamsApi.list(),
  });

  const items = teams.data?.data?.teams || [];

  return (
    <main className="mx-auto max-w-6xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Teams</h1>
          <p className="text-xs text-slate-500">
            Organise people into teams. Projects live under a team.
          </p>
        </div>
        {user?.role === "admin" ? (
          <Button onClick={() => setOpen(true)}>+ New team</Button>
        ) : null}
      </div>

      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
          No teams yet.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {items.map((t) => (
            <Link
              key={t._id}
              to={`/teams/${t._id}`}
              className="block rounded-lg border border-slate-100 bg-white p-4 shadow-sm transition hover:border-slate-300 hover:shadow"
            >
              <h3 className="text-sm font-semibold text-slate-900">{t.name}</h3>
              {t.description ? (
                <p className="mt-1 text-xs text-slate-500">{t.description}</p>
              ) : null}
              <div className="mt-3 flex items-center -space-x-1">
                {(t.members || []).slice(0, 6).map((m) => (
                  <Avatar
                    key={m._id || m}
                    name={m.name || "?"}
                    src={m.avatar}
                    size={24}
                  />
                ))}
                <span className="ml-3 text-[11px] text-slate-500">
                  {t.members?.length || 0} members
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}

      <NewTeamModal open={open} onClose={() => setOpen(false)} />
    </main>
  );
}

function NewTeamModal({ open, onClose }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState(null);

  const create = useMutation({
    mutationFn: () => teamsApi.create({ name, description }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["teams"] });
      setName("");
      setDescription("");
      setError(null);
      onClose();
    },
    onError: (err) => {
      const status = err?.response?.status;
      const msg = err?.response?.data?.message;
      if (status === 403) {
        setError(
          "Only admins can create teams. Promote your account to admin in MongoDB (set role: 'admin' on your user document) and log in again.",
        );
      } else {
        setError(msg || err?.message || "Failed to create team");
      }
    },
  });

  return (
    <Modal open={open} onClose={onClose} title="New team">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          if (name.trim()) create.mutate();
        }}
        className="space-y-3"
      >
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
        <div className="flex justify-end gap-2">
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
