import { describe, expect, it, vi } from "vitest";
import { FilesClientError, createFilesClient } from "../../dist/files/index.js";
import {
  NocoBaseHttpError,
  type NocoBaseClient,
} from "../../dist/client/index.js";

const file = {
  id: "file-1",
  policy: "default",
  originalName: "a.txt",
  contentType: "text/plain",
  size: 3,
  status: "ready",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};
const target = (mode: "proxy" | "presigned-put" = "proxy") => ({
  uploadId: "upload-1",
  fileId: "file-1",
  expiresAt: "2026-01-01T00:01:00.000Z",
  target: {
    mode,
    method: "PUT",
    url:
      mode === "proxy"
        ? "https://portal.test/api/files/v1/uploads/upload-1/content"
        : "https://s3.test/signed?signature=fixture",
    headers: { "x-signed": "yes" },
    expiresAt: "2026-01-01T00:01:00.000Z",
  },
});
const setup = (responses: unknown[]) => {
  const request = vi.fn(async () => {
    const value = responses.shift();
    if (value instanceof Error) throw value;
    return value;
  });
  const client = {
    request,
    resolveUrl: (value: string) =>
      new URL(value, "https://portal.test").toString(),
    getApiUrl: () => "https://portal.test/api",
  } as unknown as NocoBaseClient;
  const transfer = vi.fn(async () => new Response(null, { status: 204 }));
  return {
    files: createFilesClient({ client, fetch: transfer }),
    request,
    transfer,
  };
};

describe("Files client", () => {
  it("unwraps basic API results and accepts delete 204", async () => {
    const config = {
      apiVersion: "files/v1",
      defaultPolicy: "default",
      policies: {},
      capabilities: { uploadModes: ["proxy"], temporaryUrls: true },
    };
    const url = {
      url: "https://portal.test/temporary",
      expiresAt: "2026-01-01T00:01:00.000Z",
      method: "GET",
      headers: {},
    };
    const { files, request } = setup([config, file, url, undefined]);
    expect(await files.getConfig()).toBe(config);
    expect(await files.get("file/1")).toBe(file);
    expect(
      await files.createUrl("file/1", {
        disposition: "attachment",
        expiresIn: 30,
      }),
    ).toBe(url);
    await files.remove("file/1");
    expect(request.mock.calls[1][0]).toContain("file%2F1");
    expect(request.mock.calls[2][1]).toMatchObject({
      method: "POST",
      body: { disposition: "attachment", expiresIn: 30 },
    });
    expect(request.mock.calls[3][1]).toMatchObject({
      method: "DELETE",
      unwrap: "none",
    });
  });

  it("uploads raw Blob through proxy then completes", async () => {
    const { files, request, transfer } = setup([target(), { file }]);
    const blob = new Blob(["abc"], { type: "text/plain" });
    expect(
      await files.upload(blob, {
        originalName: "a.txt",
        idempotencyKey: "stable-key",
      }),
    ).toBe(file);
    expect(request.mock.calls[0]).toMatchObject([
      "/api/files/v1/uploads",
      { headers: { "Idempotency-Key": "stable-key" } },
    ]);
    expect(transfer.mock.calls[0][1]).toMatchObject({
      method: "PUT",
      body: blob,
      headers: { "x-signed": "yes", "Content-Type": "text/plain" },
      credentials: "same-origin",
    });
    expect(request.mock.calls[1][0]).toContain("upload-1/complete");
  });

  it("does not leak Portal headers or cookies to a presigned target", async () => {
    const { files, request, transfer } = setup([
      target("presigned-put"),
      { file },
    ]);
    await files.upload(new Blob(["abc"]), {
      originalName: "a.bin",
      contentType: "application/octet-stream",
      idempotencyKey: "same-key",
    });
    expect(request).toHaveBeenCalledTimes(2);
    const init = transfer.mock.calls[0][1] as RequestInit;
    expect(init.credentials).toBe("omit");
    expect(init.headers).toEqual({
      "x-signed": "yes",
      "Content-Type": "application/octet-stream",
    });
    expect(JSON.stringify(init.headers)).not.toMatch(
      /authorization|cookie|workspace/i,
    );
  });

  it("normalizes server, malformed, and upload phase failures", async () => {
    const server = setup([
      new NocoBaseHttpError({
        status: 403,
        message: "Denied",
        payload: {
          error: {
            code: "FILES_FORBIDDEN",
            message: "Denied",
            retryable: false,
          },
        },
      }),
    ]);
    await expect(server.files.get("x")).rejects.toMatchObject({
      code: "FILES_FORBIDDEN",
      status: 403,
    });
    await expect(setup([undefined]).files.getConfig()).rejects.toMatchObject({
      code: "FILES_MALFORMED_RESPONSE",
    });
    const transferFailure = setup([target()]);
    transferFailure.transfer.mockResolvedValueOnce(
      new Response(null, { status: 500 }),
    );
    await expect(
      transferFailure.files.upload(new Blob(["a"]), {
        originalName: "a",
        idempotencyKey: "retry",
      }),
    ).rejects.toMatchObject({
      code: "FILES_TRANSFER_FAILED",
      upload: {
        phase: "transfer",
        uploadId: "upload-1",
        fileId: "file-1",
        idempotencyKey: "retry",
      },
    });
    expect(transferFailure.request).toHaveBeenCalledTimes(1);
    const completeFailure = setup([target(), new Error("offline")]);
    await expect(
      completeFailure.files.upload(new Blob(["a"]), {
        originalName: "a",
        idempotencyKey: "retry",
      }),
    ).rejects.toMatchObject({
      code: "FILES_NETWORK_ERROR",
      upload: {
        phase: "complete",
        uploadId: "upload-1",
        fileId: "file-1",
        idempotencyKey: "retry",
      },
    });
  });

  it("stops after prepare, transfer, and abort failures", async () => {
    const prepare = setup([new Error("offline")]);
    await expect(
      prepare.files.upload(new Blob(["a"]), {
        originalName: "a",
        idempotencyKey: "key",
      }),
    ).rejects.toMatchObject({
      upload: { phase: "prepare", idempotencyKey: "key" },
    });
    expect(prepare.transfer).not.toHaveBeenCalled();
    const aborted = setup([target()]);
    const abort = new Error("aborted");
    abort.name = "AbortError";
    aborted.transfer.mockRejectedValueOnce(abort);
    await expect(
      aborted.files.upload(new Blob(["a"]), {
        originalName: "a",
        idempotencyKey: "key",
      }),
    ).rejects.toMatchObject({
      code: "FILES_ABORTED",
      upload: { phase: "transfer" },
    });
    expect(aborted.request).toHaveBeenCalledTimes(1);
  });

  it("rejects invalid inputs and propagates AbortSignal", async () => {
    await expect(
      setup([]).files.upload(new Blob(["a"]), {}),
    ).rejects.toMatchObject({ code: "FILES_ORIGINAL_NAME_REQUIRED" });
    await expect(
      setup([]).files.upload(new Blob(["a"]), {
        originalName: "a",
        idempotencyKey: " ",
      }),
    ).rejects.toMatchObject({ code: "FILES_IDEMPOTENCY_KEY_REQUIRED" });
    const controller = new AbortController();
    const run = setup([target(), { file }]);
    await run.files.upload(new Blob(["a"]), {
      originalName: "a",
      idempotencyKey: "key",
      signal: controller.signal,
    });
    expect(run.request.mock.calls[0][1].signal).toBe(controller.signal);
    expect(run.transfer.mock.calls[0][1].signal).toBe(controller.signal);
  });

  it("fails unknown targets before transfer and uses deterministic content type fallback", async () => {
    const bad = setup([
      { ...target(), target: { ...target().target, mode: "multipart" } },
    ]);
    await expect(
      bad.files.upload(new Blob(["a"]), {
        originalName: "a",
        idempotencyKey: "key",
      }),
    ).rejects.toBeInstanceOf(FilesClientError);
    expect(bad.transfer).not.toHaveBeenCalled();
    const fallback = setup([target(), { file }]);
    await fallback.files.upload(new Blob(["a"]), {
      originalName: "a",
      idempotencyKey: "key",
    });
    expect(fallback.request.mock.calls[0][1].body).toMatchObject({
      contentType: "application/octet-stream",
    });
  });
});
