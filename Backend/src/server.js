import http from "http";
import { Server as SocketServer } from "socket.io";

import env, { corsOrigins } from "./config/env.js";
import logger from "./config/logger.js";
import dbConnect from "./config/db.js";
import { redisSub } from "./config/redis.js";
import "./config/cloudinary.js"; // side-effect: configures if env present
import buildApp from "./app.js";
import { startScanner, stopScanner } from "./jobs/dueDateScanner.js";

const start = async () => {
  await dbConnect();

  const httpServer = http.createServer();

  const io = new SocketServer(httpServer, {
    cors: {
      origin(origin, cb) {
        if (!origin) return cb(null, true);
        if (corsOrigins.includes(origin)) return cb(null, true);
        return cb(new Error("Socket CORS blocked"));
      },
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
      credentials: true,
    },
  });

  const app = buildApp(io);
  httpServer.on("request", app);

  // ---- Socket.IO: per-user + per-project + per-task presence rooms ----
  //
  // Per-task presence tracking is in-memory (single-instance only). Map shape:
  //   taskId -> Map<socketId, { userId, name, avatar }>
  // We key by socketId (not userId) so the same user opening two tabs counts
  // as one viewer per tab — accurate "who is looking right now" semantics.
  // Cross-instance presence would need a Redis SET; out of scope for V2.
  const taskPresence = new Map();
  const broadcastPresence = (taskId) => {
    const viewersMap = taskPresence.get(taskId);
    const viewers = viewersMap
      ? // Dedup by userId for the UI (multiple tabs from one user = one chip)
        [...new Map([...viewersMap.values()].map((v) => [v.userId, v])).values()]
      : [];
    io.to(`task:${taskId}`).emit("task:presence", { taskId, viewers });
  };

  io.on("connection", (socket) => {
    logger.info(`socket connected: ${socket.id}`);
    socket.on("joinUser", (userId) => {
      if (userId) socket.join(`user:${userId}`);
    });
    socket.on("joinProject", (projectId) => {
      if (projectId) socket.join(`project:${projectId}`);
    });
    socket.on("leaveProject", (projectId) => {
      if (projectId) socket.leave(`project:${projectId}`);
    });

    socket.on("joinTask", (taskId, viewer) => {
      if (!taskId || !viewer?.userId) return;
      socket.join(`task:${taskId}`);
      let map = taskPresence.get(taskId);
      if (!map) {
        map = new Map();
        taskPresence.set(taskId, map);
      }
      map.set(socket.id, {
        userId: String(viewer.userId),
        name: viewer.name || "",
        avatar: viewer.avatar || "",
      });
      // Track which task rooms this socket joined so we can clean up on disconnect.
      socket.data.taskRooms = socket.data.taskRooms || new Set();
      socket.data.taskRooms.add(taskId);
      broadcastPresence(taskId);
    });

    socket.on("leaveTask", (taskId) => {
      if (!taskId) return;
      socket.leave(`task:${taskId}`);
      const map = taskPresence.get(taskId);
      if (map) {
        map.delete(socket.id);
        if (map.size === 0) taskPresence.delete(taskId);
      }
      socket.data.taskRooms?.delete(taskId);
      broadcastPresence(taskId);
    });

    socket.on("disconnect", () => {
      // Clear this socket from every task it was viewing, then re-broadcast.
      const rooms = socket.data.taskRooms;
      if (rooms) {
        for (const taskId of rooms) {
          const map = taskPresence.get(taskId);
          if (map) {
            map.delete(socket.id);
            if (map.size === 0) taskPresence.delete(taskId);
          }
          broadcastPresence(taskId);
        }
      }
      logger.info(`socket disconnected: ${socket.id}`);
    });
  });

  // ---- Redis pub/sub bridge (horizontal-scale safe) ----
  const channels = ["task-events", "activity-events", "notification-events"];
  for (const ch of channels) {
    redisSub.subscribe(ch, (err) => {
      if (err) logger.error(`Redis subscribe ${ch} failed: ${err.message}`);
      else logger.info(`Redis subscribed: ${ch}`);
    });
  }

  redisSub.on("message", (channel, message) => {
    try {
      const payload = JSON.parse(message);
      switch (channel) {
        case "task-events": {
          // broadcast generic + granular event names so clients can subscribe
          // to whichever convention they prefer
          const eventTypeMap = {
            created: "task:created",
            updated: "task:updated",
            status_change: "task:moved",
            reorder: "task:moved",
            deleted: "task:deleted",
            comment: "comment:added",
          };
          const granular = eventTypeMap[payload.type] || "task:updated";
          const target = payload.projectId
            ? io.to(`project:${payload.projectId}`)
            : io;
          target.emit("taskUpdated", payload); // legacy
          target.emit(granular, payload); // spec-aligned granular event
          break;
        }
        case "activity-events":
          if (payload.scope === "project" && payload.refId)
            io.to(`project:${payload.refId}`).emit("activity", payload);
          break;
        case "notification-events":
          if (payload.userId) {
            io.to(`user:${payload.userId}`).emit("notification", payload);
            io.to(`user:${payload.userId}`).emit("notification:new", payload);
          }
          break;
        default:
          break;
      }
    } catch {
      io.emit(channel);
    }
  });

  httpServer.listen(env.PORT, () => {
    logger.info(
      `MERN Task Manager V2 listening on http://localhost:${env.PORT}`,
    );
  });

  // Periodic background jobs (Redis-locked so multi-instance is safe).
  startScanner({ runImmediately: env.NODE_ENV !== "production" });

  // graceful shutdown
  const shutdown = (signal) => {
    logger.info(`Received ${signal}, shutting down...`);
    stopScanner();
    httpServer.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
};

start().catch((err) => {
  logger.error(`Startup failed: ${err.message}`);
  process.exit(1);
});
