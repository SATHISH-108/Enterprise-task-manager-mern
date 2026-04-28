import api from "./client.js";

// ---------- Auth ----------
export const authApi = {
  register: (data) => api.post("/auth/register", data).then((r) => r.data),
  login: (data) => api.post("/auth/login", data).then((r) => r.data),
  logout: () => api.post("/auth/logout").then((r) => r.data),
  me: () => api.get("/auth/me").then((r) => r.data),
  forgotPassword: (email) =>
    api.post("/auth/forgot-password", { email }).then((r) => r.data),
  resetPassword: (token, password) =>
    api
      .post(`/auth/reset-password/${token}`, { password })
      .then((r) => r.data),
  changePassword: (oldPassword, newPassword) =>
    api
      .post("/auth/change-password", { oldPassword, newPassword })
      .then((r) => r.data),
};

// ---------- Users ----------
export const usersApi = {
  list: (params) => api.get("/users", { params }).then((r) => r.data),
  get: (id) => api.get(`/users/${id}`).then((r) => r.data),
  updateMe: (patch) => api.patch("/users/me", patch).then((r) => r.data),
};

// ---------- Teams ----------
export const teamsApi = {
  list: () => api.get("/teams").then((r) => r.data),
  create: (data) => api.post("/teams", data).then((r) => r.data),
  get: (id) => api.get(`/teams/${id}`).then((r) => r.data),
  update: (id, patch) => api.patch(`/teams/${id}`, patch).then((r) => r.data),
  remove: (id) => api.delete(`/teams/${id}`).then((r) => r.data),
  addMember: (id, userId) =>
    api.post(`/teams/${id}/members`, { userId }).then((r) => r.data),
  removeMember: (id, userId) =>
    api.delete(`/teams/${id}/members/${userId}`).then((r) => r.data),
};

// ---------- Projects ----------
export const projectsApi = {
  list: (params) => api.get("/projects", { params }).then((r) => r.data),
  create: (data) => api.post("/projects", data).then((r) => r.data),
  get: (id) => api.get(`/projects/${id}`).then((r) => r.data),
  update: (id, patch) =>
    api.patch(`/projects/${id}`, patch).then((r) => r.data),
  remove: (id) => api.delete(`/projects/${id}`).then((r) => r.data),
  addMember: (id, userId) =>
    api
      .post(`/projects/${id}/members`, { userId })
      .then((r) => r.data),
  removeMember: (id, userId) =>
    api
      .delete(`/projects/${id}/members/${userId}`)
      .then((r) => r.data),
  syncMembers: (id) =>
    api.post(`/projects/${id}/sync-members`).then((r) => r.data),
  progress: (id) => api.get(`/projects/${id}/progress`).then((r) => r.data),
};

// ---------- Tasks ----------
export const tasksApi = {
  list: (params) => api.get("/tasks", { params }).then((r) => r.data),
  create: (data) => api.post("/tasks", data).then((r) => r.data),
  get: (id) => api.get(`/tasks/${id}`).then((r) => r.data),
  update: (id, patch) => api.patch(`/tasks/${id}`, patch).then((r) => r.data),
  patchStatus: (id, status, position) =>
    api
      .patch(`/tasks/${id}/status`, { status, position })
      .then((r) => r.data),
  patchPosition: (id, position) =>
    api.patch(`/tasks/${id}/position`, { position }).then((r) => r.data),
  remove: (id) => api.delete(`/tasks/${id}`).then((r) => r.data),
  addDependency: (id, depId) =>
    api
      .post(`/tasks/${id}/dependencies`, { depId })
      .then((r) => r.data),
  listDependencies: (id) =>
    api.get(`/tasks/${id}/dependencies`).then((r) => r.data),
  removeDependency: (id, depId) =>
    api.delete(`/tasks/${id}/dependencies/${depId}`).then((r) => r.data),
  listComments: (taskId, params) =>
    api.get(`/tasks/${taskId}/comments`, { params }).then((r) => r.data),
  addComment: (taskId, body, mentions = []) =>
    api
      .post(`/tasks/${taskId}/comments`, { body, mentions })
      .then((r) => r.data),
  listActivity: (taskId) =>
    api.get(`/tasks/${taskId}/activity`).then((r) => r.data),
  // Single-file upload — kept for backward compatibility. Internally calls
  // addAttachments with a one-item array so there's exactly one network path.
  addAttachment: (taskId, file) => {
    return tasksApi.addAttachments(taskId, [file]).then((r) => ({
      ...r,
      data: { ...(r.data || {}), attachment: r.data?.attachments?.[0] },
    }));
  },
  // True batch upload — N files in ONE multipart request. Backend uploads
  // them to Cloudinary in parallel and persists in one save.
  addAttachments: (taskId, files) => {
    const fd = new FormData();
    for (const f of files) fd.append("files", f);
    return api
      .post(`/tasks/${taskId}/attachments`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      })
      .then((r) => r.data);
  },
  removeAttachment: (taskId, attachmentId) =>
    api
      .delete(`/tasks/${taskId}/attachments/${attachmentId}`)
      .then((r) => r.data),

  // Threaded reply — a `parent` comment id collapses to thread root server-side.
  addReply: (taskId, body, parent, mentions = []) =>
    api
      .post(`/tasks/${taskId}/comments`, { body, parent, mentions })
      .then((r) => r.data),

  // Time tracking
  getRunningTimer: (taskId) =>
    api.get(`/tasks/${taskId}/timer`).then((r) => r.data),
  startTimer: (taskId, note) =>
    api.post(`/tasks/${taskId}/timer/start`, { note }).then((r) => r.data),
  stopTimer: (taskId) =>
    api.post(`/tasks/${taskId}/timer/stop`).then((r) => r.data),
};

// ---------- Notifications ----------
export const notifsApi = {
  list: (params) => api.get("/notifications", { params }).then((r) => r.data),
  unreadCount: () =>
    api.get("/notifications/unread-count").then((r) => r.data),
  markRead: (id) => api.post(`/notifications/${id}/read`).then((r) => r.data),
  markAllRead: () => api.post("/notifications/read-all").then((r) => r.data),
  pushKey: () => api.get("/notifications/push/key").then((r) => r.data),
  pushSubscribe: (subscription) =>
    api
      .post("/notifications/push/subscribe", subscription)
      .then((r) => r.data),
  pushUnsubscribe: (endpoint) =>
    api
      .post("/notifications/push/unsubscribe", { endpoint })
      .then((r) => r.data),
};

// ---------- Analytics ----------
export const analyticsApi = {
  admin: (range = "7d") =>
    api.get("/analytics/admin", { params: { range } }).then((r) => r.data),
  me: (range = "7d") =>
    api.get("/analytics/me", { params: { range } }).then((r) => r.data),
  project: (id) => api.get(`/analytics/project/${id}`).then((r) => r.data),
  activity: () => api.get("/analytics/activity").then((r) => r.data),
  completedPerWeek: () =>
    api.get("/analytics/completed-per-week").then((r) => r.data),
};

// ---------- AI ----------
export const aiApi = {
  describe: (title, context) =>
    api.post("/ai/describe", { title, context }).then((r) => r.data),
  subtasks: (title, description) =>
    api.post("/ai/subtasks", { title, description }).then((r) => r.data),
  suggestAssignee: (taskId) =>
    api.post("/ai/suggest-assignee", { taskId }).then((r) => r.data),
  nlSearch: (query) =>
    api.post("/ai/nl-search", { query }).then((r) => r.data),
  scoreDelay: (taskId) =>
    api.post("/ai/score-delay", { taskId }).then((r) => r.data),
  chat: (message, history = []) =>
    api.post("/ai/chat", { message, history }).then((r) => r.data),
};
