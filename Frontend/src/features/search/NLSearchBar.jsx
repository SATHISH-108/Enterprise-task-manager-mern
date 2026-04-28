import { useState, useRef, useEffect } from "react";
import { Search, X } from "lucide-react";
import { Link } from "react-router-dom";
import { aiApi } from "../../shared/api/endpoints.js";
import Badge from "../../shared/components/Badge.jsx";
import Spinner from "../../shared/components/Spinner.jsx";

export default function NLSearchBar() {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [res, setRes] = useState(null);
  const boxRef = useRef(null);

  useEffect(() => {
    const onClick = (e) => {
      if (!boxRef.current?.contains(e.target)) setOpen(false);
    };
    if (open) document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [open]);

  const search = async (e) => {
    e?.preventDefault();
    if (!q.trim()) return;
    setLoading(true);
    setOpen(true);
    try {
      const r = await aiApi.nlSearch(q.trim());
      setRes(r.data);
    } catch {
      setRes({ tasks: [], source: "error" });
    } finally {
      setLoading(false);
    }
  };

  const clear = () => {
    setQ("");
    setRes(null);
    setOpen(false);
  };

  const tasks = res?.tasks || [];

  return (
    <div ref={boxRef} className="relative hidden w-80 md:block">
      <form onSubmit={search} className="relative">
        <Search
          size={14}
          className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
        />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => res && setOpen(true)}
          placeholder='Try: "overdue high priority tasks"'
          className="w-full rounded-md border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-8 text-xs outline-none focus:border-slate-400 focus:bg-white"
        />
        {q ? (
          <button
            type="button"
            onClick={clear}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:bg-slate-100"
          >
            <X size={12} />
          </button>
        ) : null}
      </form>

      {open && (
        <div className="absolute right-0 top-9 z-40 w-[480px] max-w-[90vw] rounded-lg border border-slate-100 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
            <span className="text-[11px] font-medium text-slate-500">
              {loading
                ? "Searching…"
                : `${tasks.length} result${tasks.length === 1 ? "" : "s"}`}
            </span>
            {res?.source ? (
              <Badge tone="slate">
                {res.source === "ai" ? "AI filter" : "rule match"}
              </Badge>
            ) : null}
          </div>
          <div className="max-h-[420px] overflow-y-auto">
            {loading ? (
              <div className="flex justify-center p-4">
                <Spinner />
              </div>
            ) : tasks.length === 0 ? (
              <div className="px-3 py-6 text-center text-xs text-slate-500">
                No matches. Try phrasings like "due tomorrow", "blocked tasks",
                or "urgent tasks assigned to me".
              </div>
            ) : (
              tasks.map((t) => (
                <Link
                  key={t._id}
                  to={`/projects/${t.project?._id || t.project}`}
                  onClick={() => setOpen(false)}
                  className="block border-b border-slate-100 px-3 py-2 hover:bg-slate-50"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-800">
                      {t.title}
                    </span>
                    <Badge tone={t.priority}>{t.priority}</Badge>
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-500">
                    <span>{t.project?.name || "—"}</span>
                    <span>·</span>
                    <span>{t.status}</span>
                    {t.dueDate ? (
                      <>
                        <span>·</span>
                        <span>
                          due {new Date(t.dueDate).toLocaleDateString()}
                        </span>
                      </>
                    ) : null}
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
