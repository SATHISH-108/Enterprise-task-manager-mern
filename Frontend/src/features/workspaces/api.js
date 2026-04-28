import api from "../../shared/api/client.js";

export const workspacesApi = {
  list: () => api.get("/workspaces").then((r) => r.data),
  get: (id) => api.get(`/workspaces/${id}`).then((r) => r.data),
  create: (data) => api.post("/workspaces", data).then((r) => r.data),
  update: (id, patch) =>
    api.patch(`/workspaces/${id}`, patch).then((r) => r.data),
  remove: (id) => api.delete(`/workspaces/${id}`).then((r) => r.data),

  attachTeam: (id, teamId) =>
    api.post(`/workspaces/${id}/teams`, { teamId }).then((r) => r.data),
  detachTeam: (id, teamId) =>
    api.delete(`/workspaces/${id}/teams/${teamId}`).then((r) => r.data),

  addMember: (id, userId) =>
    api.post(`/workspaces/${id}/members`, { userId }).then((r) => r.data),
  removeMember: (id, userId) =>
    api.delete(`/workspaces/${id}/members/${userId}`).then((r) => r.data),
};
