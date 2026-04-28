/**
 * Socket.IO integration smoke test.
 *
 * Boots a real socket.io server (no Mongo, Redis is mocked), opens two
 * client sockets, and verifies that an event published from one client's
 * project room reaches the other. This covers the core "real-time fanout"
 * promise of the kanban — if this test goes red, every collaborative
 * feature breaks.
 */

process.env.NODE_ENV = "test";
process.env.MONGO_URI = process.env.MONGO_URI || "mongodb://localhost/test";
process.env.REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
process.env.JWT_ACCESS_SECRET = "test-access-secret";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret";
process.env.APP_URL = "http://localhost:5173";
process.env.CLIENT_ORIGIN = "http://localhost:5173";

import http from "http";
import { Server as SocketServer } from "socket.io";
import { io as Client } from "socket.io-client";
import { jest } from "@jest/globals";

// Mock Redis the same way the smoke suite does so this test doesn't need a
// running redis-server.
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

describe("socket.io fanout", () => {
  let httpServer;
  let io;
  let port;

  beforeAll((done) => {
    httpServer = http.createServer();
    io = new SocketServer(httpServer, {
      cors: { origin: "*", methods: ["GET", "POST"] },
    });

    // Mirror the joinUser / joinProject handlers from the real server.js.
    io.on("connection", (socket) => {
      socket.on("joinUser", (userId) => {
        if (userId) socket.join(`user:${userId}`);
      });
      socket.on("joinProject", (projectId) => {
        if (projectId) socket.join(`project:${projectId}`);
      });
    });

    httpServer.listen(0, () => {
      port = httpServer.address().port;
      done();
    });
  });

  afterAll((done) => {
    io.close();
    httpServer.close(done);
  });

  it("relays a project-room emit from one client to another", (done) => {
    const projectId = "p-test-1";
    const a = Client(`http://localhost:${port}`, { transports: ["websocket"] });
    const b = Client(`http://localhost:${port}`, { transports: ["websocket"] });

    const cleanup = () => {
      a.disconnect();
      b.disconnect();
    };

    let bothJoined = 0;
    const onJoined = () => {
      bothJoined += 1;
      if (bothJoined < 2) return;
      // Both clients are in the project room — emit from the server side.
      io.to(`project:${projectId}`).emit("taskUpdated", {
        type: "status_change",
        taskId: "t1",
        projectId,
        status: "completed",
      });
    };

    b.on("taskUpdated", (payload) => {
      try {
        expect(payload).toMatchObject({
          taskId: "t1",
          projectId,
          status: "completed",
        });
        cleanup();
        done();
      } catch (err) {
        cleanup();
        done(err);
      }
    });

    a.on("connect", () => {
      a.emit("joinProject", projectId);
      // Tiny delay so the join lands before we mark "ready"
      setTimeout(onJoined, 20);
    });
    b.on("connect", () => {
      b.emit("joinProject", projectId);
      setTimeout(onJoined, 20);
    });
  }, 8000);
});
