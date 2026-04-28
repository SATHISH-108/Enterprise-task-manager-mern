import { z } from "zod";
import { MILESTONE_STATUSES } from "./milestone.model.js";

const objectId = z.string().length(24);
const isoDate = z.coerce.date().optional().nullable();

export const createMilestoneSchema = z.object({
  project: objectId,
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  status: z.enum(MILESTONE_STATUSES).optional(),
  startDate: isoDate,
  dueDate: isoDate,
});

export const updateMilestoneSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).optional(),
    status: z.enum(MILESTONE_STATUSES).optional(),
    startDate: isoDate,
    dueDate: isoDate,
  })
  .strict();

export const listMilestonesSchema = z
  .object({
    project: objectId.optional(),
    team: objectId.optional(),
    status: z.enum(MILESTONE_STATUSES).optional(),
  })
  .refine((q) => q.project || q.team, {
    message: "Either project or team is required",
  });

export const idParam = z.object({ id: objectId });
