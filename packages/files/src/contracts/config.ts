import { z } from "zod";

export const FilePolicySchema = z.object({
  description: z.string(), maxSize: z.number().int().positive(),
  allowedContentTypes: z.array(z.string().min(1)),
  url: z.object({ defaultTtlSeconds: z.number().int().positive(), maxTtlSeconds: z.number().int().positive() }).strict(),
}).strict().superRefine((p, ctx) => {
  if (p.url.defaultTtlSeconds > p.url.maxTtlSeconds) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "default TTL must not exceed max TTL", path: ["url", "defaultTtlSeconds"] });
});
export const PublicFilesConfigSchema = z.object({
  apiVersion: z.literal("files/v1"), defaultPolicy: z.string().min(1), policies: z.record(z.string(), FilePolicySchema),
  capabilities: z.object({ uploadModes: z.array(z.enum(["proxy", "presigned-put"])).min(1), temporaryUrls: z.literal(true) }).strict(),
}).strict();
export type FilePolicy = z.infer<typeof FilePolicySchema>;
export type PublicFilesConfig = z.infer<typeof PublicFilesConfigSchema>;
