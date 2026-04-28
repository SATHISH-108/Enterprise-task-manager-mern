/**
 * Smoke suite — runs without Mongo/Redis.
 *
 * Critical-path coverage is deliberately scoped to endpoints that don't touch
 * an external service, so `npm test` is green in CI without standing up
 * MongoDB + Redis containers. Integration tests that do touch those services
 * live behind a future `npm run test:integration` script (not yet wired).
 */
process.env.NODE_ENV = "test";
process.env.MONGO_URI = process.env.MONGO_URI || "mongodb://localhost/test";
process.env.REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
process.env.JWT_ACCESS_SECRET = "test-access-secret";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret";
process.env.APP_URL = "http://localhost:5173";
process.env.CLIENT_ORIGIN = "http://localhost:5173";

import request from "supertest";
import { jest } from "@jest/globals";

jest.unstable_mockModule("../config/redis.js", () => ({
  redis: {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue("OK"),
    del: jest.fn().mockResolvedValue(1),
    keys: jest.fn().mockResolvedValue([]),
    publish: jest.fn().mockResolvedValue(0),
  },
  redisSub: { subscribe: jest.fn(), on: jest.fn() },
}));

const { buildApp } = await import("../app.js");

const app = buildApp({ emit: () => {}, to: () => ({ emit: () => {} }) });

describe("smoke", () => {
  it("GET / returns API metadata", async () => {
    const res = await request(app).get("/");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("GET /health returns uptime", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("uptime");
  });

  it("GET /api/v2/auth/me without cookie returns 401", async () => {
    const res = await request(app).get("/api/v2/auth/me");
    expect(res.status).toBe(401);
  });

  it("GET unknown route returns 404", async () => {
    const res = await request(app).get("/definitely-not-a-route");
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it("validates body on POST /api/v2/auth/register", async () => {
    const res = await request(app).post("/api/v2/auth/register").send({});
    expect(res.status).toBe(400);
    expect(res.body.errors).toBeDefined();
  });

  it("GET /api/v2/recommendations/next-tasks without cookie returns 401", async () => {
    const res = await request(app).get("/api/v2/recommendations/next-tasks");
    expect(res.status).toBe(401);
  });

  it("GET /api/v2/recommendations/projects-at-risk without cookie returns 401", async () => {
    const res = await request(app).get(
      "/api/v2/recommendations/projects-at-risk",
    );
    expect(res.status).toBe(401);
  });

  // ---- V1 path aliases ----
  // The V1 codebase was deleted in the 2026-04-25 cleanup commit; legacy
  // URL prefixes are kept working by mounting V2 routers under them. These
  // tests lock that contract so a future refactor can't silently delete it.

  it("V1 alias GET /auth/me without cookie returns 401 (same as V2)", async () => {
    const res = await request(app).get("/auth/me");
    expect(res.status).toBe(401);
  });

  it("V1 alias GET /api/auth/me without cookie returns 401", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
  });

  it("V1 alias GET /tasks without cookie returns 401", async () => {
    const res = await request(app).get("/tasks");
    expect(res.status).toBe(401);
  });
});
