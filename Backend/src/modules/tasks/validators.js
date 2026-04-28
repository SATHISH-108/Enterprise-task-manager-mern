import { z } from "zod";
import { TASK_STATUSES, TASK_PRIORITIES } from "./task.model.js";

const objectId = z.string().length(24);
const isoDate = z.coerce.date().optional();

export const createTaskSchema = z.object({
  project: objectId,
  title: z.string().min(1).max(300),
  description: z.string().max(20000).optional(),
  status: z.enum(TASK_STATUSES).optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  assignees: z.array(objectId).optional(),
  watchers: z.array(objectId).optional(),
  startDate: isoDate,
  dueDate: isoDate,
  estimatedHours: z.number().min(0).optional(),
  tags: z.array(z.string().max(40)).optional(),
  dependencies: z.array(objectId).optional(),
  parent: objectId.optional(),
  milestone: objectId.nullable().optional(),
});

export const updateTaskSchema = createTaskSchema
  .partial()
  .extend({ project: z.undefined().optional() });

export const statusPatchSchema = z.object({
  status: z.enum(TASK_STATUSES),
  position: z.number().int().min(0).optional(),
});

export const positionPatchSchema = z.object({
  position: z.number().int().min(0),
});

export const listTasksSchema = z.object({
  project: objectId.optional(),
  team: objectId.optional(),
  status: z.enum(TASK_STATUSES).optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  assignee: objectId.optional(),
  parent: objectId.optional(),
  q: z.string().max(200).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(200).default(50),
});

export const dependencySchema = z.object({ depId: objectId });
