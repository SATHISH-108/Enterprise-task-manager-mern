import { z } from "zod";

const objectId = z.string().length(24);

export const createTeamSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(1000).optional(),
  lead: objectId.optional(),
  members: z.array(objectId).optional(),
});

export const updateTeamSchema = createTeamSchema.partial();

export const memberSchema = z.object({ userId: objectId });
