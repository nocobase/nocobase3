import type { NocoBaseClient } from "../client/index.ts";
import type { operations } from "./generated/files-v1.ts";

export type PublicFilesConfig =
  operations["filesGetConfig"]["responses"][200]["content"]["application/json"]["data"];
export type FileObject =
  operations["filesGetFile"]["responses"][200]["content"]["application/json"]["data"];
export type TemporaryFileUrl =
  operations["filesCreateUrl"]["responses"][200]["content"]["application/json"]["data"];
export type CreateUploadResult =
  operations["filesCreateUpload"]["responses"][201]["content"]["application/json"]["data"];
export type UploadTarget = CreateUploadResult["target"];
export type CompleteUploadResult =
  operations["filesCompleteUpload"]["responses"][200]["content"]["application/json"]["data"];
export type CreateUploadInput =
  operations["filesCreateUpload"]["requestBody"]["content"]["application/json"];
export type FileAccessContext = NonNullable<CreateUploadInput["context"]>;
export type RequestOptions = { signal?: AbortSignal };
export type UploadOptions = RequestOptions & {
  policy?: string;
  originalName?: string;
  contentType?: string;
  context?: FileAccessContext;
  checksum?: { algorithm: "sha256"; value: string };
  idempotencyKey?: string;
};
export type CreateFileUrlOptions = RequestOptions & {
  disposition?: "inline" | "attachment";
  expiresIn?: number;
};
export interface FilesClient {
  getConfig(options?: RequestOptions): Promise<PublicFilesConfig>;
  get(fileId: string, options?: RequestOptions): Promise<FileObject>;
  upload(file: Blob, options: UploadOptions): Promise<FileObject>;
  createUrl(
    fileId: string,
    options?: CreateFileUrlOptions,
  ): Promise<TemporaryFileUrl>;
  remove(fileId: string, options?: RequestOptions): Promise<void>;
}
export type FilesClientOptions = {
  client: NocoBaseClient;
  fetch?: typeof globalThis.fetch;
};
