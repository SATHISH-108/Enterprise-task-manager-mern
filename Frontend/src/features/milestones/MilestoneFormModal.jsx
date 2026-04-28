import { useEffect, useState } from "react";
import Modal from "../../shared/components/Modal.jsx";
import Button from "../../shared/components/Button.jsx";
import Input, { Textarea } from "../../shared/components/Input.jsx";
import { useMilestoneMutations } from "./hooks.js";

const STATUSES = ["upcoming", "active", "completed", "canceled"];

export default function MilestoneFormModal({
  open,
  onClose,
  projectId,
  initial,
}) {
  const editing = !!initial?._id;
  const { create, update } = useMilestoneMutations({ projectId });

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("upcoming");
  const [startDate, setStartDate] = useState("");
  const [dueDate, setDueDate] = useState("");

  useEffect(() => {
    if (!open) return;
    setName(initial?.name || "");
    setDescription(initial?.description || "");
    setStatus(initial?.status || "upcoming");
    setStartDate(initial?.startDate ? initial.startDate.slice(0, 10) : "");
    setDueDate(initial?.dueDate ? initial.dueDate.slice(0, 10) : "");
  }, [open, initial]);

  const submit = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    const payload = {
      name: name.trim(),
      description,
      status,
      startDate: startDate ? new Date(startDate).toISOString() : null,
      dueDate: dueDate ? new Date(dueDate).toISOString() : null,
    };
    if (editing) {
      update.mutate(
        { id: initial._id, patch: payload },
        { onSuccess: onClose },
      );
    } else {
      create.mutate(
        { project: projectId, ...payload },
        { onSuccess: onClose },
      );
    }
  };

  const pending = editing ? update.isPending : create.isPending;

  return (
    <Modal open={open} onClose={onClose} title={editing ? "Edit milestone" : "New milestone"}>
      <form onSubmit={submit} className="space-y-3">
        <Input
          label="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Q3 Beta Launch"
          autoFocus
        />
        <Textarea
          label="Description"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What needs to ship by this milestone?"
        />
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Start date (optional — sets sprint mode)"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
          <Input
            label="Due date"
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </div>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">Status</span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>
        <p className="rounded bg-slate-50 px-2 py-1.5 text-[11px] text-slate-500">
          Tip: Set both start + due dates to treat this as a <strong>sprint</strong> — the UI shows time-elapsed progress.
        </p>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={pending}>
            {editing ? "Save" : "Create"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
