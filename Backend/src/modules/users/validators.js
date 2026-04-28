import { z } from "zod";

export const updateMeSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  avatar: z.string().url().max(500).optional(),
});

export const listUsersSchema = z.object({
  q: z.string().max(200).optional(),
  team: z.string().length(24).optional(),
  limit: z.coerce.number().int().positive().max(100).default(25),
  page: z.coerce.number().int().positive().default(1),
});
