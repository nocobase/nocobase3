import { writeFile } from "node:fs/promises";
import { createFilesOpenAPIApp } from "../http/index.ts";
import { parseFilesConfig } from "../config/index.ts";
import { createFilesOpenAPIDocument } from "./index.ts";
import type { FileService } from "../application/file-service.ts";
import type { UploadService } from "../application/upload-service.ts";

const config = parseFilesConfig({ defaultPolicy: "default", backends: { local: { driver: "local", root: ".", signingSecret: "x".repeat(32) } }, policies: { default: { backend: "local", description: "Default files", maxSize: 1, allowedContentTypes: ["*/*"], uploadUrlTtlSeconds: 60, defaultReadUrlTtlSeconds: 60, maxReadUrlTtlSeconds: 300 } } });
const app = createFilesOpenAPIApp({ config, requestContext: { getActor: () => ({ id: "actor" }), getWorkspaceId: () => "workspace" }, getDriverCapabilities: () => [{ uploadModes: ["proxy"] }], files: {} as FileService, uploads: {} as UploadService });
await writeFile(new URL("../../openapi/files-v1.json", import.meta.url), `${JSON.stringify(createFilesOpenAPIDocument(app), null, 2)}\n`);
