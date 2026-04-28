import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format, differenceInDays } from "date-fns";
import { Flag } from "lucide-react";
import { teamsApi } from "../../shared/api/endpoints.js";
import { milestonesApi } from "./api.js";
import Spinner from "../../shared/components/Spinner.jsx";

/**
 * Aggregate upcoming/active milestones across every team the admin can see.
 * Sorted by due date, surfaces top 5 with progress bars.
 */
export default function UpcomingMilestonesCard() {
  const teamsQ = useQuery({
    queryKey: ["teams"],
    queryFn: () => teamsApi.list(),
  });

  const teams = teamsQ.data?.data?.teams || [];

  const milestonesQ = useQuery({
    queryKey: ["milestones", "all-teams", teams.map((t) => t._id).sort().join(",")],
    queryFn: async () => {
      const all = await Promise.all(
        teams.map((t) =>
          milestonesApi
            .list({ team: t._id })
            .then((r) => (r.data?.items || []).map((m) => ({ ...m, _team: t })))
            .catch(() => []),
        ),
      );
      return all.flat();
    },
    enabled: teams.length > 0,
  });

  if (teamsQ.isLoading || milestonesQ.isLoading) {
    return (
      <div className="rounded-lg border border-slate-100 bg-white p-4">
        <Spinner />
      </div>
    );
  }

  const items = (milestonesQ.data || [])
    .filter((m) => m.status === "upcoming" || m.status === "active")
    .sort((a, b) => {
      const ad = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
      const bd = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
      return ad - bd;
    })
    .slice(0, 5);

  return (
    <section className="rounded-lg border border-slate-100 bg-white p-4">
      <header className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Flag size={14} className="text-slate-500" />
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-700">
            Upcoming milestones
          </h3>
        </div>
        <span className="text-[11px] text-slate-400">
          {items.length} active
        </span>
      </header>

      {items.length === 0 ? (
        <p className="py-4 text-center text-xs text-slate-400">
          No upcoming milestones across your teams.
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((m) => {
            const days = m.dueDate
              ? differenceInDays(new Date(m.dueDate), new Date())
              : null;
            const overdue = days != null && days < 0;
            return (
              <li
                key={m._id}
                className="rounded-md border border-slate-100 bg-slate-50/40 p-2.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-sm font-medium text-slate-900">
                      <span className="truncate">{m.name}</span>
                      {m.isSprint && (
                        <span className="rounded bg-sky-100 px-1 text-[9px] font-semibold text-sky-700">
                          sprint
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-500">
                      <Link
                        to={`/projects/${m.project?._id || m.project}`}
                        className="hover:underline"
                      >
                        {m.project?.name || "—"}
                      </Link>
                      <span>·</span>
                      <Link
                        to={`/teams/${m._team._id}/roadmap`}
                        className="hover:underline"
                      >
                        {m._team.name}
                      </Link>
                      {m.dueDate && (
                        <>
                          <span>·</span>
                          <span className={overdue ? "text-red-600" : ""}>
                            {overdue
                              ? `${Math.abs(days)}d overdue`
                              : `due ${format(new Date(m.dueDate), "MMM d")}`}
                          </span>
                        </>
                      )}
                    </div>
                    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        style={{ width: `${m.progress.completionPct}%` }}
                        className={`h-full rounded-full ${
                          m.progress.completionPct >= 80
                            ? "bg-emerald-500"
                            : m.progress.completionPct >= 40
                              ? "bg-sky-500"
                              : "bg-amber-500"
                        }`}
                      />
                    </div>
                  </div>
                  <span className="text-[11px] font-semibold text-slate-700">
                    {m.progress.completionPct}%
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
