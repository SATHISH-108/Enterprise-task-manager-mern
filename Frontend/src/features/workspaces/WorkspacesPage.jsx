import { useState } from "react";
import { Link } from "react-router-dom";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Plus, Building2, Trash2 } from "lucide-react";
import { workspacesApi } from "./api.js";
import { useAuth } from "../../store/authStore.js";
import Spinner from "../../shared/components/Spinner.jsx";
import Badge from "../../shared/components/Badge.jsx";
import Button from "../../shared/components/Button.jsx";
import Input, { Textarea } from "../../shared/components/Input.jsx";
import Modal from "../../shared/components/Modal.jsx";

export default function WorkspacesPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const isAdmin = user?.role === "admin";
  const [creating, setCreating] = useState(false);

  const q = useQuery({
    queryKey: ["workspaces"],
    queryFn: () => workspacesApi.list(),
  });

  const remove = useMutation({
    mutationFn: (id) => workspacesApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["workspaces"] }),
  });

  const items = q.data?.data?.items || [];

  return (
    <main className="mx-auto max-w-5xl space-y-4 p-6">
      <header className="flex items-end justify-between">
        <div>
          <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-500">
            <Building2 size={13} />
            Org tier
          </div>
          <h1 className="mt-0.5 text-xl font-semibold text-slate-900">Workspaces</h1>
          <p className="text-xs text-slate-500">
            Group your teams under workspaces. Today this is a categorisation
            tier; existing team and project access controls are unchanged.
          </p>
        </div>
        {isAdmin && (
          <Button onClick={() => setCreating(true)}>
            <Plus size={14} /> New workspace
          </Button>
        )}
      </header>

      {q.isLoading ? (
        <div className="flex h-40 items-center justify-center">
          <Spinner />
        </div>
      ) : items.length === 0 ? (
        <p className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-12 text-center text-xs text-slate-500">
          No workspaces yet.
          {isAdmin
            ? " Create one to start grouping teams."
            : " An admin needs to create one first."}
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {items.map((ws) => {
            const isOwner =
              isAdmin ||
              (ws.owners || []).some((o) => String(o._id) === String(user?.id));
            return (
              <li
                key={ws._id}
                className="rounded-lg border border-slate-100 bg-white p-4"
              >
                <header className="mb-2 flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <Link
                      to={`/workspaces/${ws._id}`}
                      className="text-base font-semibold text-slate-900 hover:underline"
                    >
                      {ws.name}
                    </Link>
                    {ws.description && (
                      <p className="mt-1 line-clamp-2 text-xs text-slate-500">
                        {ws.description}
                      </p>
                    )}
                  </div>
                  {isAdmin && (
                    <button
                      onClick={() => {
                        if (
                          confirm(
                            `Delete workspace "${ws.name}"? Its teams will become top-level (not deleted).`,
                          )
                        )
                          remove.mutate(ws._id);
                      }}
                      className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                      title="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </header>
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-600">
                  <Badge tone="slate">{ws.teamCount} team{ws.teamCount === 1 ? "" : "s"}</Badge>
                  <span>·</span>
                  <span>{(ws.members || []).length} members</span>
                  {isOwner && (
                    <span className="ml-auto rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                      owner
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <CreateWorkspaceModal
        open={creating}
        onClose={() => setCreating(false)}
      />
    </main>
  );
}

function CreateWorkspaceModal({ open, onClose }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const create = useMutation({
    mutationFn: (data) => workspacesApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workspaces"] });
      setName("");
      setDescription("");
      onClose();
    },
    // Surface the real error so silent failures (CSRF 403, missing route
    // 404, network issues) become visible instead of leaving the modal
    // hanging with no feedback.
    onError: (err) => {
      const status = err?.response?.status;
      const msg = err?.response?.data?.message;
      const detail = msg ? ` — ${msg}` : "";
      const hint =
        status === 403
          ? " Check that the backend has been restarted (CSRF middleware was added in the last update) and that you're logged in as admin."
          : status === 404
            ? " The /workspaces endpoint isn't reachable. Restart the backend so the new module mounts."
            : "";
      // eslint-disable-next-line no-alert
      alert(
        `Couldn't create workspace${
          status ? ` (HTTP ${status})` : ""
        }${detail}.${hint}`,
      );
    },
  });

  return (
    <Modal open={open} onClose={onClose} title="New workspace">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) create.mutate({ name: name.trim(), description });
        }}
        className="space-y-3"
      >
        <Input
          label="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Acme Corp"
          autoFocus
        />
        <Textarea
          label="Description (optional)"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        {create.isError ? (
          <div className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">
            {create.error?.response?.data?.message ||
              "Request failed. Check the browser console / network tab."}
          </div>
        ) : null}
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
