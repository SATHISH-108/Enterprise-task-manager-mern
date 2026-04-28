import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import {
  analyticsApi,
  usersApi,
  teamsApi,
  projectsApi,
} from "../../shared/api/endpoints.js";
import { useSocketEvent } from "../../shared/socket/useSocket.js";
import Spinner from "../../shared/components/Spinner.jsx";
import Avatar from "../../shared/components/Avatar.jsx";
import Badge from "../../shared/components/Badge.jsx";
import ProjectsAtRiskCard from "../recommendations/ProjectsAtRiskCard.jsx";
import UpcomingMilestonesCard from "../milestones/UpcomingMilestonesCard.jsx";

const PRIORITY_COLORS = {
  low: "#cbd5e1",
  medium: "#38bdf8",
  high: "#f59e0b",
  urgent: "#ef4444",
};

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

export default function AdminDashboard() {
  const [range, setRange] = useState("7d");
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["analytics", "admin", range],
    queryFn: () => analyticsApi.admin(range),
  });
  // Completed-per-week is its own endpoint (not part of `admin`) because it
  // uses ISO week buckets over an 8-week window — different domain than the
  // 7d/30d range used elsewhere on the dashboard.
  const completedQ = useQuery({
    queryKey: ["analytics", "completed-per-week"],
    queryFn: () => analyticsApi.completedPerWeek(),
  });

  // Live refresh: admins receive a `notification` for every task edit a
  // non-admin makes (notifyAdminsOfUserEdit in tasks/service.js), plus any
  // assignment / status change relevant to them. Refetch analytics on those
  // signals so the dashboard counts stay accurate without a manual reload.
  const refreshAdmin = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["analytics", "admin"] });
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
          refreshAdmin();
        }
      },
      [refreshAdmin],
    ),
  );
  const usersQ = useQuery({
    queryKey: ["admin", "users"],
    queryFn: () => usersApi.list({ limit: 100 }),
  });
  const teamsQ = useQuery({
    queryKey: ["admin", "teams"],
    queryFn: () => teamsApi.list(),
  });
  const projectsQ = useQuery({
    queryKey: ["admin", "projects"],
    queryFn: () => projectsApi.list(),
  });

  const users = usersQ.data?.data?.items || [];
  const teams = teamsQ.data?.data?.teams || [];
  const projects = projectsQ.data?.data?.projects || [];

  // count projects per team (to show on the teams list)
  const projectsByTeam = useMemo(() => {
    const m = {};
    for (const p of projects) {
      const tid = String(p.team?._id || p.team || "");
      m[tid] = (m[tid] || 0) + 1;
    }
    return m;
  }, [projects]);

  if (q.isLoading)
    return (
      <div className="flex h-60 items-center justify-center">
        <Spinner />
      </div>
    );

  const d = q.data?.data;
  const priority = (d?.byPriority || []).map((r) => ({
    name: r.priority,
    value: r.count,
  }));

  return (
    <main className="mx-auto max-w-7xl space-y-4 p-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">
            Admin analytics
          </h1>
          <p className="text-xs text-slate-500">
            Real-time rollups across teams, projects, and users.
          </p>
        </div>
        <select
          value={range}
          onChange={(e) => setRange(e.target.value)}
          className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs"
        >
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
        </select>
      </header>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-6">
        <Card label="Users" value={d?.totals?.users || 0} />
        <Card label="Teams" value={d?.totals?.teams || 0} />
        <Card label="Projects" value={d?.totals?.projects || 0} />
        <Card label="Tasks" value={d?.totals?.tasks || 0} />
        <Card label="Completed" value={d?.totals?.completed || 0} tone="emerald" />
        <Card label="Overdue" value={d?.totals?.overdue || 0} tone="red" />
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ProjectsAtRiskCard />
        <UpcomingMilestonesCard />
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-100 bg-white p-4">
          <h3 className="mb-2 text-xs font-semibold text-slate-700">
            Tasks created per day
          </h3>
          <div className="h-60">
            <ResponsiveContainer>
              <LineChart data={d?.tasksPerDay || []}>
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

        <div className="rounded-lg border border-slate-100 bg-white p-4">
          <h3 className="mb-2 text-xs font-semibold text-slate-700">
            Tasks completed per week (last 8 weeks)
          </h3>
          <div className="h-60">
            <ResponsiveContainer>
              <BarChart data={completedQ.data?.data?.series || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                <XAxis dataKey="week" fontSize={10} />
                <YAxis fontSize={10} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-100 bg-white p-4">
          <h3 className="mb-2 text-xs font-semibold text-slate-700">
            Project completion %
          </h3>
          <div className="h-60">
            <ResponsiveContainer>
              <BarChart data={d?.projectCompletion || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                <XAxis dataKey="name" fontSize={10} />
                <YAxis fontSize={10} domain={[0, 100]} />
                <Tooltip />
                <Bar dataKey="pct" fill="#0f172a" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-lg border border-slate-100 bg-white p-4">
          <h3 className="mb-2 text-xs font-semibold text-slate-700">
            Priority distribution
          </h3>
          <div className="h-60">
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={priority}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={50}
                  outerRadius={90}
                >
                  {priority.map((p) => (
                    <Cell
                      key={p.name}
                      fill={PRIORITY_COLORS[p.name] || "#cbd5e1"}
                    />
                  ))}
                </Pie>
                <Legend fontSize={10} />
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-100 bg-white p-4">
          <h3 className="mb-2 text-xs font-semibold text-slate-700">
            Top contributors
          </h3>
          <ul className="space-y-2">
            {(d?.topUsers || []).map((u) => (
              <li
                key={u._id}
                className="flex items-center justify-between text-sm"
              >
                <span className="text-slate-800">{u.name || u.email}</span>
                <span className="text-xs text-slate-500">{u.count} tasks</span>
              </li>
            ))}
            {(d?.topUsers || []).length === 0 ? (
              <li className="text-xs text-slate-400">No data yet.</li>
            ) : null}
          </ul>
        </div>

        <div className="rounded-lg border border-slate-100 bg-white p-4">
          <h3 className="mb-2 text-xs font-semibold text-slate-700">
            Top performing teams
          </h3>
        <ul className="space-y-2">
          {(d?.topTeams || []).map((t) => (
            <li
              key={t._id}
              className="flex items-center justify-between text-sm"
            >
              <span className="text-slate-800">{t.name || "Unknown team"}</span>
              <span className="text-xs text-slate-500">
                {t.completed} completed
              </span>
            </li>
          ))}
          {(d?.topTeams || []).length === 0 ? (
            <li className="text-xs text-slate-400">
              No completed tasks yet — finish a few tasks to populate this leaderboard.
            </li>
          ) : null}
        </ul>
        </div>
      </section>

      {/* All users */}
      <section className="rounded-lg border border-slate-100 bg-white">
        <header className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-800">
            All users{" "}
            <span className="ml-1 text-xs text-slate-400">({users.length})</span>
          </h3>
          {usersQ.isLoading && <Spinner className="h-3 w-3" />}
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2 text-left">User</th>
                <th className="px-4 py-2 text-left">Email</th>
                <th className="px-4 py-2 text-left">Role</th>
                <th className="px-4 py-2 text-left">Teams</th>
                <th className="px-4 py-2 text-left">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((u) => (
                <tr key={u._id} className="hover:bg-slate-50">
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <Avatar name={u.name} src={u.avatar} size={24} />
                      <span className="text-slate-800">{u.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2 text-slate-600">{u.email}</td>
                  <td className="px-4 py-2">
                    <Badge tone={u.role === "admin" ? "amber" : "slate"}>
                      {u.role}
                    </Badge>
                  </td>
                  <td className="px-4 py-2 text-xs text-slate-600">
                    {(u.teams || [])
                      .map((t) => t.name || "—")
                      .filter(Boolean)
                      .join(", ") || "—"}
                  </td>
                  <td className="px-4 py-2 text-xs text-slate-500">
                    {u.createdAt
                      ? new Date(u.createdAt).toLocaleDateString()
                      : "—"}
                  </td>
                </tr>
              ))}
              {users.length === 0 && !usersQ.isLoading && (
                <tr>
                  <td colSpan="5" className="px-4 py-6 text-center text-xs text-slate-400">
                    No users yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* All teams */}
      <section className="rounded-lg border border-slate-100 bg-white">
        <header className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-800">
            All teams{" "}
            <span className="ml-1 text-xs text-slate-400">({teams.length})</span>
          </h3>
          <Link to="/teams" className="text-xs text-slate-500 hover:text-slate-800">
            Manage →
          </Link>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2 text-left">Team</th>
                <th className="px-4 py-2 text-left">Lead</th>
                <th className="px-4 py-2 text-left">Members</th>
                <th className="px-4 py-2 text-left">Projects</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {teams.map((t) => (
                <tr key={t._id} className="hover:bg-slate-50">
                  <td className="px-4 py-2">
                    <Link
                      to={`/teams/${t._id}`}
                      className="font-medium text-slate-800 hover:underline"
                    >
                      {t.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-slate-600">
                    {t.lead?.name || "—"}
                  </td>
                  <td className="px-4 py-2 text-slate-600">
                    {(t.members || []).length}
                  </td>
                  <td className="px-4 py-2 text-slate-600">
                    {projectsByTeam[String(t._id)] || 0}
                  </td>
                </tr>
              ))}
              {teams.length === 0 && !teamsQ.isLoading && (
                <tr>
                  <td colSpan="4" className="px-4 py-6 text-center text-xs text-slate-400">
                    No teams yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* All projects */}
      <section className="rounded-lg border border-slate-100 bg-white">
        <header className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-800">
            All projects{" "}
            <span className="ml-1 text-xs text-slate-400">
              ({projects.length})
            </span>
          </h3>
          <Link to="/projects" className="text-xs text-slate-500 hover:text-slate-800">
            Manage →
          </Link>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2 text-left">Project</th>
                <th className="px-4 py-2 text-left">Team</th>
                <th className="px-4 py-2 text-left">Members</th>
                <th className="px-4 py-2 text-left">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {projects.map((p) => (
                <tr key={p._id} className="hover:bg-slate-50">
                  <td className="px-4 py-2">
                    <Link
                      to={`/projects/${p._id}`}
                      className="font-medium text-slate-800 hover:underline"
                    >
                      {p.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-slate-600">
                    {p.team?.name || "—"}
                  </td>
                  <td className="px-4 py-2 text-slate-600">
                    {(p.members || []).length}
                  </td>
                  <td className="px-4 py-2">
                    <Badge
                      tone={
                        p.status === "active"
                          ? "emerald"
                          : p.status === "archived"
                            ? "slate"
                            : "amber"
                      }
                    >
                      {p.status}
                    </Badge>
                  </td>
                </tr>
              ))}
              {projects.length === 0 && !projectsQ.isLoading && (
                <tr>
                  <td colSpan="4" className="px-4 py-6 text-center text-xs text-slate-400">
                    No projects yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
