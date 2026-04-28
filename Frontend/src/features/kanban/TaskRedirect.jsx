import { useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { tasksApi } from "../../shared/api/endpoints.js";
import Spinner from "../../shared/components/Spinner.jsx";

/**
 * Notifications and emails point at /tasks/:id. There is no standalone task
 * page — every task lives inside a project's Kanban board. Resolve the task,
 * read its project, and forward to /projects/:projectId?task=:taskId so the
 * board page can auto-open the drawer.
 */
export default function TaskRedirect() {
  const { id } = useParams();
  const nav = useNavigate();

  const q = useQuery({
    queryKey: ["task", id],
    queryFn: () => tasksApi.get(id),
    enabled: !!id,
    retry: false,
  });

  useEffect(() => {
    const task = q.data?.data?.task;
    if (task?.project) {
      const projectId = task.project._id || task.project;
      nav(`/projects/${projectId}?task=${id}`, { replace: true });
    } else if (q.isError) {
      nav("/", { replace: true });
    }
  }, [q.data, q.isError, id, nav]);

  return (
    <div className="flex h-[60vh] items-center justify-center text-xs text-slate-500">
      <Spinner /> <span className="ml-2">Opening task…</span>
    </div>
  );
}
