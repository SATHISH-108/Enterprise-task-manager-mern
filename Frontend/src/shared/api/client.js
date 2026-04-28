import axios from "axios";

const BASE = (import.meta.env.VITE_API_URL || "http://localhost:7002").replace(/\/+$/, "");

export const api = axios.create({
  baseURL: `${BASE}/api/v2`,
  withCredentials: true,
});

// ---- Explicit CSRF header attachment ----
// axios' built-in xsrf-cookie auto-read is unreliable for cross-port dev
// (localhost:5173 → localhost:7002) — even with `withCredentials: true` and
// the right cookie/header names, the auto-attach silently no-ops in some
// versions, producing a 403 "CSRF token missing or invalid". Doing it
// ourselves with a request interceptor side-steps the version drift.
const SAFE_METHODS = new Set(["get", "head", "options"]);

const readCookie = (name) => {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${name}=([^;]+)`),
  );
  return match ? decodeURIComponent(match[1]) : null;
};

api.interceptors.request.use((config) => {
  const method = (config.method || "get").toLowerCase();
  if (SAFE_METHODS.has(method)) return config;
  const token = readCookie("XSRF-TOKEN");
  if (token) {
    config.headers = config.headers || {};
    config.headers["X-XSRF-Token"] = token;
  } else if (typeof console !== "undefined") {
    // eslint-disable-next-line no-console
    console.warn(
      `[csrf] ${method.toUpperCase()} ${config.url} — no XSRF-TOKEN cookie found. ` +
        "Will retry once after fetching /csrf.",
    );
  }
  return config;
});

// On a 403 from a CSRF-protected endpoint, fetch /csrf once to guarantee the
// cookie is issued, then retry the original request exactly one time.
api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config || {};
    const status = err.response?.status;
    const isCsrfFail =
      status === 403 &&
      /csrf/i.test(err.response?.data?.message || "") &&
      !original._csrfRetried;
    if (!isCsrfFail) return Promise.reject(err);
    original._csrfRetried = true;
    try {
      // Hit the explicit bootstrap endpoint — server middleware mints the
      // cookie + this endpoint returns the value so the call always
      // produces a usable XSRF-TOKEN in document.cookie.
      await axios.get(`${BASE}/api/v2/csrf`, { withCredentials: true });
      const fresh = readCookie("XSRF-TOKEN");
      if (fresh) {
        original.headers = original.headers || {};
        original.headers["X-XSRF-Token"] = fresh;
      }
      return api(original);
    } catch (e) {
      return Promise.reject(err);
    }
  },
);

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
