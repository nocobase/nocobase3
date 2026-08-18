import { z } from "zod";

export const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([z.string(), z.number().finite(), z.boolean(), z.null(), z.array(JsonValueSchema), JsonObjectSchema]),
);
export const JsonObjectSchema: z.ZodType<JsonObject> = z.record(z.string(), JsonValueSchema)
  .superRefine((value, ctx) => {
    if (Object.keys(value).length > 32) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "object has too many keys" });
  }) as z.ZodType<JsonObject>;
export const FileAccessContextSchema = JsonObjectSchema;
export type FileAccessContext = JsonObject;

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export const ChecksumSchema = z.object({ algorithm: z.literal("sha256"), value: z.string().min(1) }).strict();
export type Checksum = z.infer<typeof ChecksumSchema>;
export const SuccessEnvelopeSchema = <T extends z.ZodTypeAny>(data: T) => z.object({ data }).strict();
export type SuccessEnvelope<T> = { data: T };

export const ID_LENGTH = 256;
export const IdempotencyKeySchema = z.string().trim().min(1).max(ID_LENGTH);
