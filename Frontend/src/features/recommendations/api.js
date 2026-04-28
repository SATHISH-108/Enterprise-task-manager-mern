import api from "../../shared/api/client.js";

export const recommendationsApi = {
  nextTasks: (limit = 3) =>
    api
      .get("/recommendations/next-tasks", { params: { limit } })
      .then((r) => r.data),
  projectsAtRisk: (limit = 5) =>
    api
      .get("/recommendations/projects-at-risk", { params: { limit } })
      .then((r) => r.data),
  projectHealth: (id) =>
    api.get(`/recommendations/projects/${id}/health`).then((r) => r.data),
  rebalance: (id) =>
    api.get(`/recommendations/projects/${id}/rebalance`).then((r) => r.data),
  acceptRebalance: (projectId, taskId, newAssigneeId) =>
    api
      .post(`/recommendations/projects/${projectId}/rebalance/accept`, {
        taskId,
        newAssigneeId,
      })
      .then((r) => r.data),
};
