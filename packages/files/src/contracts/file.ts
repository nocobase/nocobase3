import { z } from "zod";
import { ChecksumSchema } from "./common.ts";

export const FileStatusSchema = z.enum(["pending", "ready", "failed", "deleted"]);
export type FileStatus = z.infer<typeof FileStatusSchema>;
export const FileActionSchema = z.enum(["read", "delete"]);
export const FileObjectSchema = z.object({
  id: z.string().min(1), policy: z.string().min(1), originalName: z.string().min(1),
  contentType: z.string().min(1), size: z.number().int().nonnegative(), checksum: ChecksumSchema.optional(),
  status: FileStatusSchema, createdAt: z.string().datetime(), updatedAt: z.string().datetime(),
  allowedActions: z.array(FileActionSchema).optional(),
}).strict();
export type FileObject = z.infer<typeof FileObjectSchema>;
