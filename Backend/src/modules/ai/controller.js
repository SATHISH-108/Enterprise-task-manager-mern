import { z } from "zod";
import * as svc from "./service.js";
import { ok, asyncHandler } from "../../utils/response.js";

export const describe = asyncHandler(async (req, res) => {
  const schema = z.object({
    title: z.string().min(1).max(300),
    context: z.string().max(2000).optional(),
  });
  const data = schema.parse(req.body);
  return ok(res, await svc.describeTask(data));
});

export const subtasks = asyncHandler(async (req, res) => {
  const schema = z.object({
    title: z.string().min(1).max(300),
    description: z.string().max(20000).optional(),
  });
  const data = schema.parse(req.body);
  return ok(res, await svc.suggestSubtasks(data));
});

export const suggestAssignee = asyncHandler(async (req, res) => {
  const schema = z.object({ taskId: z.string().length(24) });
  const data = schema.parse(req.body);
  return ok(res, await svc.suggestAssignee(data, req.user));
});

export const nlSearch = asyncHandler(async (req, res) => {
  const schema = z.object({ query: z.string().min(1).max(500) });
  const data = schema.parse(req.body);
  return ok(res, await svc.nlSearch(data, req.user));
});

export const scoreDelay = asyncHandler(async (req, res) => {
  const schema = z.object({ taskId: z.string().length(24) });
  const data = schema.parse(req.body);
  return ok(res, await svc.scoreDelay(data.taskId));
});

export const chat = asyncHandler(async (req, res) => {
  const schema = z.object({
    message: z.string().min(1).max(2000),
    history: z
      .array(
        z.object({
          role: z.enum(["user", "assistant"]),
          content: z.string().max(2000),
        }),
      )
      .max(20)
      .optional(),
  });
  const data = schema.parse(req.body);
  return ok(res, await svc.chat(data, req.user));
});
