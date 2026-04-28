import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Paperclip, Download, Eye, Trash2, Upload } from "lucide-react";
import { tasksApi } from "../../shared/api/endpoints.js";
import Spinner from "../../shared/components/Spinner.jsx";

const humanSize = (bytes = 0) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const isImage = (mime = "") => /^image\//i.test(mime);

// Cloudinary cross-origin trick: inserting `/fl_attachment/` into the
// delivery path makes the response come back with
// Content-Disposition: attachment, so the browser downloads instead of
// rendering inline. The plain HTML `download` attribute is ignored across
// origins, which is why we rewrite the URL itself.
const forceDownloadUrl = (url, filename) => {
  if (!url) return url;
  const marker = "/upload/";
  const idx = url.indexOf(marker);
  if (idx === -1) return url;
  const safeName = filename
    ? `:${encodeURIComponent(filename.replace(/\.[^.]+$/, ""))}`
    : "";
  return (
    url.slice(0, idx + marker.length) +
    `fl_attachment${safeName}/` +
    url.slice(idx + marker.length)
  );
};

export default function Attachments({ task }) {
  const qc = useQueryClient();
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState(null);

  const upload = async (files) => {
    setErr(null);
    setUploading(true);
    try {
      // Single multipart POST with every file — backend uploads to Cloudinary
      // in parallel and persists them in one save.
      await tasksApi.addAttachments(task._id, files);
      qc.invalidateQueries({ queryKey: ["task", task._id] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
    } catch (e) {
      setErr(e.response?.data?.message || "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const onPick = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length) upload(files);
  };

  const onDrop = (e) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length) upload(files);
  };

  const remove = async (attId) => {
    if (!confirm("Remove attachment?")) return;
    await tasksApi.removeAttachment(task._id, attId);
    qc.invalidateQueries({ queryKey: ["task", task._id] });
  };

  const items = task.attachments || [];

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        className="flex items-center justify-between rounded-md border border-dashed border-slate-200 bg-slate-50 p-4"
      >
        <div className="text-xs text-slate-600">
          Drag files here or{" "}
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="font-medium text-slate-800 underline"
          >
            browse
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          className="hidden"
          multiple
          onChange={onPick}
        />
        {uploading ? <Spinner className="h-4 w-4" /> : <Upload size={16} />}
      </div>

      {err ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">
          {err}
        </div>
      ) : null}

      {items.length === 0 ? (
        <p className="text-xs text-slate-400">No attachments yet.</p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-md border border-slate-100">
          {items.map((a) => (
            <li
              key={a._id || a.publicId}
              className="flex items-center justify-between gap-2 p-2"
            >
              <a
                href={a.url}
                target="_blank"
                rel="noreferrer"
                className="flex min-w-0 flex-1 items-center gap-2 text-xs text-slate-700 hover:text-slate-900"
                title="Preview"
              >
                {isImage(a.mime) ? (
                  <img
                    src={a.url}
                    alt={a.name || "attachment"}
                    className="h-9 w-9 shrink-0 rounded border border-slate-100 object-cover"
                    loading="lazy"
                  />
                ) : (
                  <Paperclip size={14} className="shrink-0 text-slate-400" />
                )}
                <span className="truncate">{a.name || a.url}</span>
                <span className="shrink-0 text-[10px] text-slate-400">
                  {humanSize(a.size)}
                </span>
              </a>
              <div className="flex items-center gap-1">
                <a
                  href={a.url}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  title="Preview in new tab"
                >
                  <Eye size={14} />
                </a>
                <a
                  href={forceDownloadUrl(a.url, a.name)}
                  // `download` is the polite hint; the URL rewrite above is the
                  // real mechanism (works cross-origin via Cloudinary).
                  download={a.name || true}
                  className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  title="Download"
                >
                  <Download size={14} />
                </a>
                <button
                  type="button"
                  onClick={() => remove(a._id)}
                  className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                  title="Remove"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
