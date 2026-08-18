import { z } from "zod";
import type { PublicFilesConfig } from "../contracts/config.ts";
import type { S3CredentialProvider } from "../storage/s3/s3-config.ts";

const KEY = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const MIME = /^(\*\/\*|[A-Za-z0-9!#$&^_.+-]+\/([A-Za-z0-9!#$&^_.+-]+|\*))$/;
const TTL_MAX = 31_536_000;

const s3Endpoint = z.string().url().refine(value => { const protocol = new URL(value).protocol; return protocol === "http:" || protocol === "https:"; }, "endpoint must use http or https");
const s3Prefix = z.string().transform(value => value.replace(/^\/+|\/+$/g, "")).refine(value => !value.split("/").some(part => !part || part === "." || part === "..") && !value.includes("\\"), "invalid rootPrefix");
const s3Credentials = z.union([z.object({ accessKeyId: z.string().min(1), secretAccessKey: z.string().min(1), sessionToken: z.string().min(1).optional(), expiration: z.date().optional() }).strict(), z.custom<S3CredentialProvider>(value => typeof value === "function")]);
const BackendSchema = z.discriminatedUnion("driver", [
  z.object({ driver: z.literal("local"), root: z.string().trim().min(1), signingSecret: z.string().min(32) }).strict(),
  z.object({ driver: z.literal("s3"), endpoint: s3Endpoint.optional(), region: z.string().trim().min(1), container: z.string().trim().min(1), rootPrefix: s3Prefix.optional(), forcePathStyle: z.boolean().optional(), credentials: s3Credentials.optional() }).strict(),
]);
const PolicySchema = z.object({
  backend: z.string().regex(KEY), description: z.string().trim().min(1).max(500), maxSize: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  allowedContentTypes: z.array(z.string().trim().regex(MIME)).min(1), uploadUrlTtlSeconds: z.number().int().positive().max(TTL_MAX), defaultReadUrlTtlSeconds: z.number().int().positive().max(TTL_MAX), maxReadUrlTtlSeconds: z.number().int().positive().max(TTL_MAX),
}).strict().superRefine((p, c) => { if (p.defaultReadUrlTtlSeconds > p.maxReadUrlTtlSeconds) c.addIssue({ code: "custom", path: ["defaultReadUrlTtlSeconds"], message: "must not exceed maxReadUrlTtlSeconds" }); });
export const FilesConfigSchema = z.object({ defaultPolicy: z.string().regex(KEY), backends: z.record(z.string().regex(KEY), BackendSchema), policies: z.record(z.string().regex(KEY), PolicySchema) }).strict().superRefine((v, c) => {
  if (!Object.keys(v.backends).length) c.addIssue({ code: "custom", path: ["backends"], message: "at least one backend is required" });
  if (!Object.keys(v.policies).length) c.addIssue({ code: "custom", path: ["policies"], message: "at least one policy is required" });
  if (!(v.defaultPolicy in v.policies)) c.addIssue({ code: "custom", path: ["defaultPolicy"], message: "policy does not exist" });
  for (const [name, p] of Object.entries(v.policies)) if (!(p.backend in v.backends)) c.addIssue({ code: "custom", path: ["policies", name, "backend"], message: "backend does not exist" });
}).transform(v => ({ ...v, policies: Object.fromEntries(Object.entries(v.policies).map(([k, p]) => [k, { ...p, allowedContentTypes: [...new Set(p.allowedContentTypes)] }])) }));
export type ValidatedFilesConfig = z.output<typeof FilesConfigSchema>;
export type FilesBackend = ValidatedFilesConfig["backends"][string];
export interface DriverCapabilities { uploadModes: ("proxy" | "presigned-put")[] }
export function parseFilesConfig(input: unknown): ValidatedFilesConfig { return FilesConfigSchema.parse(input); }
export function createPublicFilesConfig(config: ValidatedFilesConfig, capabilities: DriverCapabilities[]): PublicFilesConfig {
  const modes = [...new Set(capabilities.flatMap(c => c.uploadModes))].sort((a, b) => a === "proxy" ? -1 : b === "proxy" ? 1 : 0);
  return { apiVersion: "files/v1", defaultPolicy: config.defaultPolicy, policies: Object.fromEntries(Object.entries(config.policies).map(([k, p]) => [k, { description: p.description, maxSize: p.maxSize, allowedContentTypes: p.allowedContentTypes, url: { defaultTtlSeconds: p.defaultReadUrlTtlSeconds, maxTtlSeconds: p.maxReadUrlTtlSeconds } }])), capabilities: { uploadModes: modes, temporaryUrls: true } };
}
