import { z } from "zod";

export const limitQuery = z.object({
  limit: z.coerce.number().int().min(1).max(20).default(3),
});

export const summaryLimitQuery = z.object({
  limit: z.coerce.number().int().min(1).max(20).default(5),
});

export const acceptBody = z.object({
  taskId: z.string().length(24),
  newAssigneeId: z.string().length(24),
});

export const idParam = z.object({ id: z.string().length(24) });
