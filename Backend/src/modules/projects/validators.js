import { z } from "zod";
import { PROJECT_STATUSES } from "./project.model.js";

const objectId = z.string().length(24);
const isoDate = z.coerce.date().optional();

export const createProjectSchema = z.object({
  team: objectId,
  name: z.string().min(1).max(160),
  description: z.string().max(2000).optional(),
  status: z.enum(PROJECT_STATUSES).optional(),
  startDate: isoDate,
  dueDate: isoDate,
  members: z.array(objectId).optional(),
});

export const updateProjectSchema = createProjectSchema.partial().extend({
  team: z.undefined().optional(), // team is immutable after create
});

export const listProjectSchema = z.object({
  team: objectId.optional(),
  status: z.enum(PROJECT_STATUSES).optional(),
});
