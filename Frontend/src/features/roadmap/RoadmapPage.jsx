import { useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format, differenceInDays } from "date-fns";
import { CalendarRange, Flag } from "lucide-react";
import { teamsApi } from "../../shared/api/endpoints.js";
import { useTeamMilestones } from "../milestones/hooks.js";
import Spinner from "../../shared/components/Spinner.jsx";

const labelTone = (status, dueDate) => {
  if (status === "completed") return "bg-emerald-500";
  if (status === "canceled") return "bg-slate-300";
  if (status === "active") return "bg-sky-500";
  // upcoming: red if overdue, amber if due within 7 days, otherwise neutral
  if (dueDate) {
    const days = differenceInDays(new Date(dueDate), new Date());
    if (days < 0) return "bg-red-500";
    if (days <= 7) return "bg-amber-500";
  }
  return "bg-slate-400";
};

export default function RoadmapPage() {
  const { id: teamId } = useParams();

  const teamQ = useQuery({
    queryKey: ["team", teamId],
    queryFn: () => teamsApi.get(teamId),
    enabled: !!teamId,
  });

  const ms = useTeamMilestones(teamId);

  const team = teamQ.data?.data?.team;
  const items = ms.data?.data?.items || [];

  // Compute the timeline domain — earliest start/due → latest due, with a
  // little padding so single-day milestones don't render as a point.
  const { domainStart, domainEnd, totalMs } = useMemo(() => {
    if (!items.length) {
      const now = Date.now();
      return {
        domainStart: now,
        domainEnd: now + 86_400_000 * 30,
        totalMs: 86_400_000 * 30,
      };
    }
    let min = Infinity;
    let max = -Infinity;
    for (const m of items) {
      const s = m.startDate ? new Date(m.startDate).getTime() : null;
      const e = m.dueDate ? new Date(m.dueDate).getTime() : null;
      if (s != null) min = Math.min(min, s);
      if (e != null) min = Math.min(min, e);
      if (e != null) max = Math.max(max, e);
      if (s != null) max = Math.max(max, s);
    }
    if (!isFinite(min) || !isFinite(max)) {
      const now = Date.now();
      return {
        domainStart: now,
        domainEnd: now + 86_400_000 * 30,
        totalMs: 86_400_000 * 30,
      };
    }
    const pad = 86_400_000 * 3;
    return {
      domainStart: min - pad,
      domainEnd: max + pad,
      totalMs: max + pad - (min - pad),
    };
  }, [items]);

  // Group milestones by project for the row layout.
  const byProject = useMemo(() => {
    const map = new Map();
    for (const m of items) {
      const key = m.project?._id || String(m.project);
      if (!map.has(key)) {
        map.set(key, { project: m.project, milestones: [] });
      }
      map.get(key).milestones.push(m);
    }
    return [...map.values()];
  }, [items]);

  if (teamQ.isLoading || ms.isLoading) {
    return (
      <div className="flex h-60 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  const todayPct =
    totalMs > 0
      ? Math.max(
          0,
          Math.min(100, ((Date.now() - domainStart) / totalMs) * 100),
        )
      : null;

  return (
    <main className="mx-auto max-w-[1400px] px-4 py-4">
      <header className="mb-3">
        <Link
          to={`/teams/${teamId}`}
          className="text-[11px] font-medium uppercase tracking-wide text-slate-500 hover:text-slate-700"
        >
          ← {team?.name || "Team"}
        </Link>
        <h1 className="mt-0.5 flex items-center gap-2 text-lg font-semibold text-slate-900">
          <CalendarRange size={18} className="text-slate-500" />
          Roadmap
        </h1>
        <p className="text-xs text-slate-500">
          Milestones across every project in this team, sorted by due date.
        </p>
      </header>

      {items.length === 0 ? (
        <p className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-12 text-center text-xs text-slate-500">
          No milestones in this team yet. Open a project and add a milestone to populate the roadmap.
        </p>
      ) : (
        <div className="space-y-3">
          {/* Timeline ruler */}
          <div className="relative h-6 rounded-md bg-slate-50 px-3">
            <div className="absolute left-3 top-1 text-[10px] text-slate-500">
              {format(new Date(domainStart), "MMM d")}
            </div>
            <div className="absolute right-3 top-1 text-[10px] text-slate-500">
              {format(new Date(domainEnd), "MMM d, yyyy")}
            </div>
            {todayPct != null && (
              <div
                style={{ left: `calc(${todayPct}% + 12px)` }}
                className="pointer-events-none absolute top-0 h-full w-px bg-red-300"
                title="Today"
              />
            )}
          </div>

          {byProject.map(({ project, milestones }) => (
            <section
              key={String(project?._id || project)}
              className="rounded-lg border border-slate-100 bg-white p-3"
            >
              <header className="mb-2 flex items-center justify-between">
                <Link
                  to={`/projects/${project?._id || project}`}
                  className="text-sm font-semibold text-slate-900 hover:underline"
                >
                  {project?.name || "Project"}
                </Link>
                <span className="text-[10px] text-slate-400">
                  {milestones.length} milestone{milestones.length === 1 ? "" : "s"}
                </span>
              </header>
              <div className="relative h-12 rounded bg-slate-50">
                {milestones.map((m) => {
                  const start = m.startDate
                    ? new Date(m.startDate).getTime()
                    : m.dueDate
                      ? new Date(m.dueDate).getTime() - 86_400_000
                      : domainStart;
                  const end = m.dueDate
                    ? new Date(m.dueDate).getTime()
                    : start + 86_400_000;
                  const leftPct = ((start - domainStart) / totalMs) * 100;
                  const widthPct = Math.max(
                    1.5,
                    ((end - start) / totalMs) * 100,
                  );
                  return (
                    <Link
                      key={m._id}
                      to={`/projects/${m.project?._id || m.project}?tab=board`}
                      title={`${m.name} — ${m.progress.completionPct}% complete`}
                      style={{
                        left: `${leftPct}%`,
                        width: `${widthPct}%`,
                      }}
                      className={`absolute top-1.5 flex h-9 items-center gap-1 overflow-hidden rounded px-1.5 text-[10px] font-medium text-white shadow-sm transition hover:scale-y-110 ${labelTone(m.status, m.dueDate)}`}
                    >
                      <Flag size={9} className="shrink-0" />
                      <span className="truncate">{m.name}</span>
                      <span className="ml-auto shrink-0 rounded bg-black/20 px-1">
                        {m.progress.completionPct}%
                      </span>
                    </Link>
                  );
                })}
                {todayPct != null && (
                  <div
                    style={{ left: `${todayPct}%` }}
                    className="pointer-events-none absolute top-0 h-full w-px bg-red-300"
                  />
                )}
              </div>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
