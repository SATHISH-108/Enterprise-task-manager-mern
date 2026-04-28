import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { format } from "date-fns";
import { analyticsApi } from "../../shared/api/endpoints.js";
import { useAuth } from "../../store/authStore.js";
import { useSocketEvent } from "../../shared/socket/useSocket.js";
import Spinner from "../../shared/components/Spinner.jsx";
import Badge from "../../shared/components/Badge.jsx";
import NextTaskCard from "../recommendations/NextTaskCard.jsx";

const Card = ({ label, value, tone = "slate" }) => (
  <div className="rounded-lg border border-slate-100 bg-white p-4">
    <div className="text-[11px] uppercase tracking-wide text-slate-500">
      {label}
    </div>
    <div className={`mt-1 text-2xl font-semibold text-${tone}-900`}>
      {value}
    </div>
  </div>
);

export default function UserDashboard() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["analytics", "me"],
    queryFn: () => analyticsApi.me("7d"),
  });

  // Live refresh: when an admin (or anyone) changes a task assigned to me,
  // the backend fires `task_status_changed` / `task_assigned` notifications
  // through the user:<id> room. Use those as a signal to refetch analytics
  // so the dashboard cards reflect the change immediately rather than
  // waiting for the 60s Redis cache to expire.
  const refreshAnalytics = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["analytics", "me"] });
  }, [qc]);

  useSocketEvent(
    "notification",
    useCallback(
      (payload) => {
        const t = payload?.notification?.type;
        if (
          t === "task_assigned" ||
          t === "task_status_changed" ||
          t === "task_overdue" ||
          t === "task_due_soon"
        ) {
          refreshAnalytics();
        }
      },
      [refreshAnalytics],
    ),
  );

  if (q.isLoading)
    return (
      <div className="flex h-60 items-center justify-center">
        <Spinner />
      </div>
    );

  const d = q.data?.data;

  return (
    <main className="mx-auto max-w-6xl space-y-4 p-6">
      <header>
        <h1 className="text-xl font-semibold text-slate-900">
          Welcome back, {user?.name?.split(" ")[0] || "there"}
        </h1>
        <p className="text-xs text-slate-500">Your workload at a glance</p>
      </header>

      <NextTaskCard />

      <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Card label="Assigned" value={d?.totals?.assigned || 0} />
        <Card label="Completed" value={d?.totals?.completed || 0} tone="emerald" />
        <Card label="Overdue" value={d?.totals?.overdue || 0} tone="red" />
        <Card label="Due this week" value={d?.totals?.upcomingWeek || 0} tone="amber" />
        <Card
          label="Est. hours"
          value={d?.totals?.estimatedWorkloadHours || 0}
        />
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-lg border border-slate-100 bg-white p-4 lg:col-span-2">
          <h3 className="mb-2 text-xs font-semibold text-slate-700">
            Completed tasks (last 7 days)
          </h3>
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={d?.completedPerDay || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                <XAxis dataKey="date" fontSize={10} />
                <YAxis fontSize={10} />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="count"
                  stroke="#0f172a"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="flex flex-col rounded-lg border border-slate-100 bg-gradient-to-br from-slate-900 to-slate-700 p-4 text-white">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-300">
            This week's workload
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-wide text-slate-300">
                Due in 7 days
              </div>
              <div className="mt-0.5 text-2xl font-bold">
                {d?.totals?.upcomingWeek || 0}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wide text-slate-300">
                Est. hours
              </div>
              <div className="mt-0.5 text-2xl font-bold">
                {d?.totals?.estimatedWorkloadHours || 0}h
              </div>
            </div>
          </div>

          {/* Per-day hours bar chart */}
          <div className="mt-3 h-24">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={(d?.hoursByDay || []).map((row) => ({
                  ...row,
                  label: format(new Date(row.date), "EEE"),
                }))}
                margin={{ top: 4, right: 4, left: -20, bottom: 0 }}
              >
                <XAxis
                  dataKey="label"
                  fontSize={9}
                  stroke="#cbd5e1"
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis hide />
                <Tooltip
                  contentStyle={{
                    background: "#0f172a",
                    border: "1px solid #334155",
                    borderRadius: 6,
                    fontSize: 11,
                  }}
                  labelStyle={{ color: "#e2e8f0" }}
                  formatter={(v, name) => [`${v}h`, "hours"]}
                />
                <Bar
                  dataKey="hours"
                  fill="#38bdf8"
                  radius={[3, 3, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Tasks due this week */}
          <div className="mt-3 border-t border-slate-600 pt-3">
            <div className="mb-1 text-[10px] uppercase tracking-wide text-slate-300">
              Tasks due this week
            </div>
            {(d?.weekTasks || []).length === 0 ? (
              <div className="text-[11px] text-slate-400">
                Nothing due in the next 7 days.
              </div>
            ) : (
              <ul className="max-h-40 space-y-1 overflow-y-auto">
                {(d?.weekTasks || []).map((t) => (
                  <li key={t._id}>
                    <Link
                      to={`/projects/${t.project?._id || t.project}?task=${t._id}`}
                      className="flex items-center justify-between rounded-md bg-slate-800/40 px-2 py-1.5 text-[11px] hover:bg-slate-800/70"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium text-white">
                          {t.title}
                        </div>
                        <div className="truncate text-[10px] text-slate-400">
                          {t.project?.name || "—"} ·{" "}
                          {format(new Date(t.dueDate), "EEE MMM d")}
                        </div>
                      </div>
                      <Badge tone={t.priority}>{t.priority}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
