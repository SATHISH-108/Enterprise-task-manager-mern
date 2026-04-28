import { io } from "socket.io-client";

const BASE = (import.meta.env.VITE_API_URL || "http://localhost:7002").replace(/\/+$/, "");

let socket = null;

export const getSocket = () => {
  if (!socket) {
    socket = io(BASE, {
      withCredentials: true,
      autoConnect: false,
      transports: ["websocket", "polling"],
    });
  }
  return socket;
};

export const connectSocket = (userId) => {
  const s = getSocket();
  if (!s.connected) s.connect();
  if (userId) s.emit("joinUser", userId);
  return s;
};

export const disconnectSocket = () => {
  if (socket?.connected) socket.disconnect();
};

export const joinProject = (projectId) => {
  if (socket?.connected) socket.emit("joinProject", projectId);
};

export const leaveProject = (projectId) => {
  if (socket?.connected) socket.emit("leaveProject", projectId);
};

// Per-task presence — `viewer` is { userId, name, avatar } so the server can
// fan out enough info for the UI without a per-user DB lookup. The server
// dedupes by userId when broadcasting, so multi-tab opens count as one chip.
export const joinTask = (taskId, viewer) => {
  if (socket?.connected && taskId && viewer?.userId)
    socket.emit("joinTask", taskId, viewer);
};

export const leaveTask = (taskId) => {
  if (socket?.connected && taskId) socket.emit("leaveTask", taskId);
};
