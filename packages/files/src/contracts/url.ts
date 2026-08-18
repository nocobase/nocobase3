import { z } from "zod";

export const CreateFileUrlInputSchema = z.object({ disposition: z.enum(["inline", "attachment"]).optional(), expiresIn: z.number().int().positive().optional() }).strict();
export type CreateFileUrlInput = z.infer<typeof CreateFileUrlInputSchema>;
export const TemporaryFileUrlSchema = z.object({ url: z.string().url(), expiresAt: z.string().datetime(), method: z.literal("GET"), headers: z.record(z.string(), z.string()) }).strict();
export type TemporaryFileUrl = z.infer<typeof TemporaryFileUrlSchema>;
