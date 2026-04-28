import { useParams, Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { LayoutGrid, Activity, Flag } from "lucide-react";
import { projectsApi } from "../../shared/api/endpoints.js";
import KanbanBoard from "../kanban/KanbanBoard.jsx";
import ProjectMembers from "./ProjectMembers.jsx";
import ProjectHealthTab from "../recommendations/ProjectHealthTab.jsx";
import MilestonesTab from "../milestones/MilestonesTab.jsx";
import Badge from "../../shared/components/Badge.jsx";
import Spinner from "../../shared/components/Spinner.jsx";

const TABS = [
  { id: "board", label: "Board", icon: LayoutGrid },
  { id: "milestones", label: "Milestones", icon: Flag },
  { id: "health", label: "Health", icon: Activity },
];

export default function ProjectBoardPage() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const tabParam = params.get("tab");
  const activeTab =
    tabParam === "health"
      ? "health"
      : tabParam === "milestones"
        ? "milestones"
        : "board";

  const project = useQuery({
    queryKey: ["project", id],
    queryFn: () => projectsApi.get(id),
    enabled: !!id,
  });

  const p = project.data?.data?.project;

  const switchTab = (tabId) => {
    const next = new URLSearchParams(params);
    if (tabId === "board") next.delete("tab");
    else next.set("tab", tabId);
    setParams(next, { replace: true });
  };

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <Link
            to="/projects"
            className="text-[11px] font-medium uppercase tracking-wide text-slate-500 hover:text-slate-700"
          >
            ← Projects
          </Link>
          <h1 className="mt-1 text-lg font-semibold text-slate-900">
            {project.isLoading ? "…" : p?.name || "Project"}
          </h1>
          {p?.team ? (
            <p className="text-xs text-slate-500">{p.team.name}</p>
          ) : null}
        </div>
        {p ? <Badge tone="slate">{p.status}</Badge> : null}
      </div>

      {project.isLoading ? (
        <div className="flex h-40 items-center justify-center">
          <Spinner />
        </div>
      ) : (
        <>
          {p && <ProjectMembers project={p} />}

          <div className="mb-3 flex items-center gap-1 border-b border-slate-200">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => switchTab(tab.id)}
                  className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition ${
                    active
                      ? "border-b-2 border-slate-900 text-slate-900"
                      : "border-b-2 border-transparent text-slate-500 hover:text-slate-800"
                  }`}
                >
                  <Icon size={13} />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {activeTab === "board" && <KanbanBoard projectId={id} />}
          {activeTab === "milestones" && <MilestonesTab project={p} />}
          {activeTab === "health" && <ProjectHealthTab projectId={id} />}
        </>
      )}
    </div>
  );
}
