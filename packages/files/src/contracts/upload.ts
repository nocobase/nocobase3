import { z } from "zod";
import { ChecksumSchema, FileAccessContextSchema, IdempotencyKeySchema } from "./common.ts";
import { FileObjectSchema } from "./file.ts";

export const UploadStatusSchema = z.enum(["pending", "completed", "expired", "failed"]);
export type UploadStatus = z.infer<typeof UploadStatusSchema>;
export const CreateUploadInputSchema = z.object({
  policy: z.string().min(1).optional(), originalName: z.string().min(1), contentType: z.string().min(1),
  size: z.number().int().nonnegative(), checksum: ChecksumSchema.optional(), context: FileAccessContextSchema.optional(),
}).strict();
export type CreateUploadInput = z.infer<typeof CreateUploadInputSchema>;
export const UploadTargetSchema = z.object({ mode: z.enum(["proxy", "presigned-put"]), method: z.literal("PUT"), url: z.string().url(), headers: z.record(z.string(), z.string()), expiresAt: z.string().datetime() }).strict();
export type UploadTarget = z.infer<typeof UploadTargetSchema>;
export const CreateUploadResultSchema = z.object({ uploadId: z.string().min(1), fileId: z.string().min(1), expiresAt: z.string().datetime(), target: UploadTargetSchema }).strict();
export type CreateUploadResult = z.infer<typeof CreateUploadResultSchema>;
export const CompleteUploadResultSchema = z.object({ file: FileObjectSchema }).strict();
export type CompleteUploadResult = z.infer<typeof CompleteUploadResultSchema>;
export { IdempotencyKeySchema };
