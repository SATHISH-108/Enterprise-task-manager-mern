import { useEffect, useState } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Play, Square, Timer as TimerIcon } from "lucide-react";
import { tasksApi } from "../../shared/api/endpoints.js";
import Spinner from "../../shared/components/Spinner.jsx";

const formatElapsed = (ms) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
  return `${m}m ${String(s).padStart(2, "0")}s`;
};

export default function TimerWidget({ taskId }) {
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["timer", taskId],
    queryFn: () => tasksApi.getRunningTimer(taskId),
    enabled: !!taskId,
  });

  const start = useMutation({
    mutationFn: () => tasksApi.startTimer(taskId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["timer", taskId] }),
  });

  const stop = useMutation({
    mutationFn: () => tasksApi.stopTimer(taskId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["timer", taskId] });
      qc.invalidateQueries({ queryKey: ["task", taskId] }); // actualHours bumped
      qc.invalidateQueries({ queryKey: ["tasks"] });
    },
  });

  const running = q.data?.data?.running;
  const startedAt = q.data?.data?.entry?.startedAt;
  const [elapsed, setElapsed] = useState(0);

  // Tick once per second while a timer is running.
  useEffect(() => {
    if (!running || !startedAt) {
      setElapsed(0);
      return undefined;
    }
    const start = new Date(startedAt).getTime();
    const update = () => setElapsed(Date.now() - start);
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [running, startedAt]);

  return (
    <section className="rounded-md border border-slate-100 bg-slate-50 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <TimerIcon size={14} className="text-slate-500" />
          <span className="text-xs font-semibold text-slate-700">
            Time tracker
          </span>
          {running ? (
            <span className="rounded bg-emerald-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-emerald-700">
              {formatElapsed(elapsed)}
            </span>
          ) : null}
        </div>
        {q.isLoading ? (
          <Spinner className="h-3 w-3" />
        ) : running ? (
          <button
            type="button"
            onClick={() => stop.mutate()}
            disabled={stop.isPending}
            className="flex items-center gap-1 rounded bg-red-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            <Square size={11} fill="currentColor" /> Stop
          </button>
        ) : (
          <button
            type="button"
            onClick={() => start.mutate()}
            disabled={start.isPending}
            className="flex items-center gap-1 rounded bg-emerald-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            <Play size={11} fill="currentColor" /> Start
          </button>
        )}
      </div>
      {!running ? (
        <p className="mt-1 text-[10px] text-slate-500">
          Hit Start to log time. On stop, hours roll into the task's actualHours.
        </p>
      ) : null}
    </section>
  );
}
