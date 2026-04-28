import { create } from "zustand";
import { authApi } from "../shared/api/endpoints.js";
import {
  connectSocket,
  disconnectSocket,
} from "../shared/socket/socketClient.js";

export const useAuth = create((set, get) => ({
  user: null,
  status: "idle", // idle | loading | authed | guest
  error: null,

  bootstrap: async () => {
    if (get().status === "loading") return;
    set({ status: "loading" });
    try {
      const { data } = await authApi.me();
      set({ user: data.user, status: "authed", error: null });
      connectSocket(data.user.id);
    } catch {
      set({ user: null, status: "guest", error: null });
    }
  },

  login: async (credentials) => {
    set({ status: "loading", error: null });
    try {
      const { data } = await authApi.login(credentials);
      set({ user: data.user, status: "authed" });
      connectSocket(data.user.id);
      return data.user;
    } catch (e) {
      set({
        status: "guest",
        error: e.response?.data?.message || "Login failed",
      });
      throw e;
    }
  },

  register: async (credentials) => {
    set({ status: "loading", error: null });
    try {
      const { data } = await authApi.register(credentials);
      set({ status: "guest" });
      return data.user;
    } catch (e) {
      set({
        status: "guest",
        error: e.response?.data?.message || "Registration failed",
      });
      throw e;
    }
  },

  logout: async () => {
    try {
      await authApi.logout();
    } catch {
      /* ignore */
    }
    disconnectSocket();
    set({ user: null, status: "guest" });
  },
}));
