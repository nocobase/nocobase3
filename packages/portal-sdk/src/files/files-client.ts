import { NocoBaseHttpError } from "../client/error.ts";
import type { NocoBaseClient } from "../client/index.ts";
import { FilesClientError, type FilesClientErrorOptions } from "./errors.ts";
import type {
  CompleteUploadResult,
  CreateUploadResult,
  FileObject,
  PublicFilesConfig,
  TemporaryFileUrl,
  FilesClient,
  FilesClientOptions,
  UploadOptions,
  CreateFileUrlOptions,
} from "./types.ts";

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : undefined;
const requireObject = <T>(
  value: unknown,
  label: string,
  fields: string[] = [],
): T => {
  const record = asRecord(value);
  if (!record || fields.some((field) => record[field] === undefined))
    throw new FilesClientError({
      code: "FILES_MALFORMED_RESPONSE",
      message: `${label} response was malformed`,
    });
  return value as T;
};
const safeText = (value: string) =>
  value.replace(/https?:\/\/\S+/gi, "[redacted-url]");
const sanitize = (value: unknown): unknown => {
  if (typeof value === "string") return safeText(value);
  if (Array.isArray(value)) return value.map(sanitize);
  const record = asRecord(value);
  if (!record) return value;
  return Object.fromEntries(
    Object.entries(record)
      .filter(([name]) => !/authorization|cookie/i.test(name))
      .map(([name, item]) => [name, sanitize(item)]),
  );
};
const errorFrom = (
  error: unknown,
  phase: "prepare" | "transfer" | "complete",
  upload?: FilesClientErrorOptions["upload"],
): FilesClientError => {
  if (error instanceof FilesClientError)
    return error.upload || !upload
      ? error
      : new FilesClientError({
          code: error.code,
          message: error.message,
          status: error.status,
          retryable: error.retryable,
          requestId: error.requestId,
          details: error.details,
          upload: { ...upload, phase },
        });
  if (error instanceof Error && error.name === "AbortError")
    return new FilesClientError({
      code: "FILES_ABORTED",
      message: "Files request was aborted",
      retryable: true,
      upload: upload && { ...upload, phase },
    });
  if (error instanceof NocoBaseHttpError) {
    const detail = asRecord(asRecord(error.payload)?.error) ?? {};
    return new FilesClientError({
      code: typeof detail.code === "string" ? detail.code : "FILES_HTTP_ERROR",
      message: safeText(
        typeof detail.message === "string" ? detail.message : error.message,
      ),
      status: error.status,
      retryable: detail.retryable === true,
      requestId: error.requestId,
      details: sanitize(detail.details),
      upload: upload && { ...upload, phase },
    });
  }
  return new FilesClientError({
    code:
      phase === "transfer" ? "FILES_TRANSFER_FAILED" : "FILES_NETWORK_ERROR",
    message: safeText(
      error instanceof Error ? error.message : "Files request failed",
    ),
    retryable: true,
    upload: upload && { ...upload, phase },
  });
};
const key = () => {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = globalThis.crypto?.getRandomValues(new Uint8Array(16));
  if (!bytes)
    throw new FilesClientError({
      code: "FILES_CRYPTO_UNAVAILABLE",
      message: "Web Crypto is required to create an idempotency key",
    });
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};
const nameAndType = (file: Blob, options: UploadOptions) => {
  const originalName =
    options.originalName ??
    ("name" in file && typeof file.name === "string" ? file.name : undefined);
  if (!originalName?.trim())
    throw new FilesClientError({
      code: "FILES_ORIGINAL_NAME_REQUIRED",
      message: "originalName is required for Blob uploads",
    });
  return {
    originalName,
    contentType: options.contentType || file.type || "application/octet-stream",
  };
};

export const createFilesClient = ({
  client,
  fetch: transferFetch = globalThis.fetch,
}: FilesClientOptions): FilesClient => {
  const request = <T>(
    endpoint: string,
    options: Parameters<NocoBaseClient["request"]>[1] = {},
  ) => client.request<T>(endpoint, options);
  const getConfig = async (options: { signal?: AbortSignal } = {}) => {
    try {
      return requireObject<PublicFilesConfig>(
        await request("/api/files/v1/config", { signal: options.signal }),
        "config",
        ["apiVersion", "defaultPolicy", "policies", "capabilities"],
      );
    } catch (e) {
      throw errorFrom(e, "prepare");
    }
  };
  const get = async (
    fileId: string,
    options: { signal?: AbortSignal } = {},
  ) => {
    try {
      return requireObject<FileObject>(
        await request(`/api/files/v1/files/${encodeURIComponent(fileId)}`, {
          signal: options.signal,
        }),
        "file",
        [
          "id",
          "policy",
          "originalName",
          "contentType",
          "size",
          "status",
          "createdAt",
          "updatedAt",
        ],
      );
    } catch (e) {
      throw errorFrom(e, "prepare");
    }
  };
  const createUrl = async (
    fileId: string,
    options: CreateFileUrlOptions = {},
  ) => {
    try {
      const body = {
        ...(options.disposition && { disposition: options.disposition }),
        ...(options.expiresIn !== undefined && {
          expiresIn: options.expiresIn,
        }),
      };
      return requireObject<TemporaryFileUrl>(
        await request(`/api/files/v1/files/${encodeURIComponent(fileId)}/url`, {
          method: "POST",
          body,
          signal: options.signal,
        }),
        "url",
        ["url", "expiresAt", "method", "headers"],
      );
    } catch (e) {
      throw errorFrom(e, "prepare");
    }
  };
  const remove = async (
    fileId: string,
    options: { signal?: AbortSignal } = {},
  ) => {
    try {
      await request(`/api/files/v1/files/${encodeURIComponent(fileId)}`, {
        method: "DELETE",
        signal: options.signal,
        unwrap: "none",
      });
    } catch (e) {
      throw errorFrom(e, "prepare");
    }
  };
  const upload = async (
    file: Blob,
    options: UploadOptions,
  ): Promise<FileObject> => {
    const { originalName, contentType } = nameAndType(file, options);
    if (options.idempotencyKey !== undefined && !options.idempotencyKey.trim())
      throw new FilesClientError({
        code: "FILES_IDEMPOTENCY_KEY_REQUIRED",
        message: "idempotencyKey must not be empty",
      });
    const idempotencyKey = options.idempotencyKey ?? key();
    let created: CreateUploadResult;
    try {
      created = requireObject<CreateUploadResult>(
        await request("/api/files/v1/uploads", {
          method: "POST",
          headers: { "Idempotency-Key": idempotencyKey },
          body: {
            policy: options.policy,
            originalName,
            contentType,
            size: file.size,
            checksum: options.checksum,
            context: options.context,
          },
          signal: options.signal,
        }),
        "upload",
        ["uploadId", "fileId", "expiresAt", "target"],
      );
      requireObject(created.target, "upload target", [
        "mode",
        "method",
        "url",
        "headers",
        "expiresAt",
      ]);
    } catch (e) {
      throw errorFrom(e, "prepare", { idempotencyKey, phase: "prepare" });
    }
    const uploadMeta = {
      uploadId: created.uploadId,
      fileId: created.fileId,
      idempotencyKey,
      phase: "transfer" as const,
    };
    try {
      if (
        created.target.mode !== "proxy" &&
        created.target.mode !== "presigned-put"
      )
        throw new FilesClientError({
          code: "FILES_UNKNOWN_TARGET_MODE",
          message: "Unsupported upload target mode",
          upload: uploadMeta,
        });
      if (created.target.method !== "PUT")
        throw new FilesClientError({
          code: "FILES_UNKNOWN_TARGET_METHOD",
          message: "Unsupported upload target method",
          upload: uploadMeta,
        });
      const targetUrl = new URL(created.target.url, client.resolveUrl("/"));
      const apiUrl = new URL(client.getApiUrl(), client.resolveUrl("/"));
      const headers = { ...created.target.headers };
      if (
        !Object.keys(headers).some(
          (name) => name.toLowerCase() === "content-type",
        )
      )
        headers["Content-Type"] = contentType;
      const response = await transferFetch(targetUrl, {
        method: created.target.method,
        headers,
        body: file,
        signal: options.signal,
        credentials:
          targetUrl.origin === apiUrl.origin ? "same-origin" : "omit",
      });
      if (!response.ok)
        throw new Error(`Upload target failed (${response.status})`);
    } catch (e) {
      throw errorFrom(e, "transfer", uploadMeta);
    }
    try {
      const result = requireObject<CompleteUploadResult>(
        await request(
          `/api/files/v1/uploads/${encodeURIComponent(created.uploadId)}/complete`,
          { method: "POST", signal: options.signal },
        ),
        "complete",
        ["file"],
      );
      return requireObject<FileObject>(result.file, "complete file", [
        "id",
        "policy",
        "originalName",
        "contentType",
        "size",
        "status",
        "createdAt",
        "updatedAt",
      ]);
    } catch (e) {
      throw errorFrom(e, "complete", { ...uploadMeta, phase: "complete" });
    }
  };
  return { getConfig, get, upload, createUrl, remove };
};
