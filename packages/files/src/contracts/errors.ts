import { z } from "zod";
import { JsonObjectSchema } from "./common.ts";

export const FilesErrorCodeSchema = z.enum([
  "FILES_INVALID_REQUEST", "FILES_POLICY_NOT_FOUND", "FILES_FILE_NOT_FOUND", "FILES_UPLOAD_NOT_FOUND", "FILES_FORBIDDEN",
  "FILES_FILE_TOO_LARGE", "FILES_CONTENT_TYPE_NOT_ALLOWED", "FILES_UPLOAD_EXPIRED", "FILES_UPLOAD_INCOMPLETE",
  "FILES_FILE_SIZE_MISMATCH", "FILES_CHECKSUM_MISMATCH", "FILES_IDEMPOTENCY_KEY_REUSED", "FILES_STORAGE_UNAVAILABLE",
  "FILES_CONFLICT", "FILES_INTERNAL_ERROR",
]);
export type FilesErrorCode = z.infer<typeof FilesErrorCodeSchema>;
export const FilesErrorEnvelopeSchema = z.object({ error: z.object({ code: FilesErrorCodeSchema, message: z.string(), retryable: z.boolean(), requestId: z.string().optional(), details: JsonObjectSchema.optional() }).strict() }).strict();
export type FilesErrorEnvelope = z.infer<typeof FilesErrorEnvelopeSchema>;
