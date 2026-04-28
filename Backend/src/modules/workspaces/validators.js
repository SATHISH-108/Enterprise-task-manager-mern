import { z } from "zod";

const objectId = z.string().length(24);

export const createWorkspaceSchema = z.object({
  name: z.string().min(1).max(160),
  description: z.string().max(2000).optional(),
});

export const updateWorkspaceSchema = z
  .object({
    name: z.string().min(1).max(160).optional(),
    description: z.string().max(2000).optional(),
  })
  .strict();

export const memberBody = z.object({ userId: objectId });
export const teamBody = z.object({ teamId: objectId });
export const idParam = z.object({ id: objectId });
