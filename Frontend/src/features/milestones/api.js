import api from "../../shared/api/client.js";

export const milestonesApi = {
  list: (params) => api.get("/milestones", { params }).then((r) => r.data),
  get: (id) => api.get(`/milestones/${id}`).then((r) => r.data),
  create: (data) => api.post("/milestones", data).then((r) => r.data),
  update: (id, patch) =>
    api.patch(`/milestones/${id}`, patch).then((r) => r.data),
  remove: (id) => api.delete(`/milestones/${id}`).then((r) => r.data),
};
