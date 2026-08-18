import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { FILES_ROUTES } from "../../src/contracts/routes.ts";

const read = (path: string) => readFile(new URL(`../../../${path}`, import.meta.url), "utf8");
const registryItems = ["nocobase-file-upload", "nocobase-file-preview", "nocobase-attachment-field", "nocobase-files-example"];

describe("G11 security matrix static boundaries", () => {
  it("keeps the public API fixed and operationIds unique", async () => {
    const document = JSON.parse(await read("files/openapi/files-v1.json"));
    const operations = Object.values(document.paths as Record<string, Record<string, { operationId?: string }>>).flatMap(methods => Object.values(methods)).flatMap(operation => operation.operationId ? [operation.operationId] : []);
    expect(new Set(operations).size).toBe(operations.length);
    expect(Object.values(FILES_ROUTES).map(route => `${route.method} ${route.path}`)).toEqual([
      "GET /api/files/v1/config", "GET /api/files/v1/files/:fileId", "POST /api/files/v1/uploads", "PUT /api/files/v1/uploads/:uploadId/content", "POST /api/files/v1/uploads/:uploadId/complete", "POST /api/files/v1/files/:fileId/url", "DELETE /api/files/v1/files/:fileId",
    ]);
  });

  it("does not expose private backend fields in OpenAPI or generated SDK types", async () => {
    const artifacts = `${await read("files/openapi/files-v1.json")}\n${await read("portal-sdk/src/files/generated/files-v1.ts")}`;
    expect(artifacts).not.toMatch(/accessKeyId|secretAccessKey|signingSecret|providerState|storageKey|rootPrefix/);
  });

  it("has no import-time scheduler or bucket listing path", async () => {
    const source = `${await read("files/src/index.ts")}\n${await read("files/src/maintenance/files-maintenance-service.ts")}\n${await read("files/src/storage/s3/s3-storage-driver.ts")}`;
    expect(source).not.toMatch(/setInterval|ListObjects/);
    expect(source).toContain("listExpiredPendingUploads");
    expect(source).toContain("listFilesPendingPhysicalDelete");
  });

  it("keeps Registry source browser-only and active content conservative", async () => {
    const sources = await Promise.all(registryItems.flatMap(item => ["README.md", "index.ts"].map(file => read(`app-template-default/registry/${item}/${file}`).catch(() => ""))));
    const filesSource = `${await read("app-template-default/registry/nocobase-file-upload/use-file-upload.ts")}\n${await read("app-template-default/registry/nocobase-file-upload/file-preview-types.ts")}\n${await read("app-template-default/registry/nocobase-file-preview/file-preview.tsx")}\n${await read("app-template-default/registry/nocobase-file-preview/types.ts")}`;
    const text = `${sources.join("\n")}\n${filesSource}`;
    expect(text).toContain("@nocobase/portal-sdk/files");
    expect(text).not.toMatch(/@aws-sdk|kysely|node:fs|from ["']fs["']|@nocobase\/files|dangerouslySetInnerHTML|<iframe/);
    expect(filesSource).toContain("svg");
    expect(filesSource).toContain("noopener,noreferrer");
  });

  it("redacts raw request and provider failures before logging", async () => {
    const source = `${await read("files/src/http/index.ts")}\n${await read("files/src/application/file-service.ts")}\n${await read("files/src/maintenance/files-maintenance-service.ts")}`;
    expect(source).not.toMatch(/logger\?\.error\((?:e|error)\)/);
    expect(source).toContain("Files request failed");
    expect(source).not.toContain("signed URL");
  });
});
