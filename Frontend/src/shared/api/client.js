import axios from "axios";

const BASE = (import.meta.env.VITE_API_URL || "http://localhost:7002").replace(/\/+$/, "");

export const api = axios.create({
  baseURL: `${BASE}/api/v2`,
  withCredentials: true,
});

let refreshPromise = null;

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config || {};
    const status = err.response?.status;

    // avoid recursive refresh loops and don't try to refresh the refresh itself
    const skip =
      original._retry ||
      original.url?.includes("/auth/refresh") ||
      original.url?.includes("/auth/login") ||
      original.url?.includes("/auth/register");

    if (status === 401 && !skip) {
      original._retry = true;
      try {
        refreshPromise =
          refreshPromise ||
          axios
            .post(`${BASE}/api/v2/auth/refresh`, null, { withCredentials: true })
            .finally(() => {
              refreshPromise = null;
            });
        await refreshPromise;
        return api(original);
      } catch (e) {
        if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
          window.location.href = "/login";
        }
        return Promise.reject(e);
      }
    }
    return Promise.reject(err);
  },
);

export default api;
