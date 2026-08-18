import type { JsonValue } from "../contracts/common.ts";

export type StorageUploadPreparation =
  | { mode: "proxy"; providerState?: Record<string, JsonValue> }
  | { mode: "presigned-put"; url: string; method: "PUT"; headers: Record<string, string>; expiresAt: Date; providerState?: Record<string, JsonValue> };
export interface StoredObjectStat { size: number; contentType?: string; checksumSha256?: string; etag?: string }
export interface ExternalReadTarget { url: string; method: "GET"; headers: Record<string, string>; expiresAt: Date }
export interface StorageDriver {
  readonly type: string;
  capabilities(): { uploadModes: Array<"proxy" | "presigned-put">; externalReadTarget: boolean };
  prepareUpload(input: { key: string; contentType: string; size: number; checksumSha256?: string; expiresAt: Date }): Promise<StorageUploadPreparation>;
  putObject?(input: { key: string; body: ReadableStream<Uint8Array>; contentType: string; expectedSize: number; checksumSha256?: string; signal?: AbortSignal }): Promise<StoredObjectStat>;
  statObject(input: { key: string; signal?: AbortSignal }): Promise<StoredObjectStat | null>;
  openRead?(input: { key: string; signal?: AbortSignal }): Promise<{ body: ReadableStream<Uint8Array>; stat: StoredObjectStat }>;
  createExternalReadTarget?(input: { key: string; fileName: string; contentType: string; disposition: "inline" | "attachment"; expiresAt: Date }): Promise<ExternalReadTarget>;
  deleteObject(input: { key: string; signal?: AbortSignal }): Promise<void>;
}
