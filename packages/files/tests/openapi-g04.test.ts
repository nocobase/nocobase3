import { expect, it } from "vitest";
import { createFilesOpenAPIApp } from "../src/http/index.ts";
import { createFilesOpenAPIDocument } from "../src/openapi/index.ts";
import { parseFilesConfig } from "../src/config/index.ts";
it("publishes config operation", () => { const c = parseFilesConfig({ defaultPolicy: "p", backends: { b: { driver: "local", root: "/x", signingSecret: "s".repeat(32) } }, policies: { p: { backend: "b", description: "P", maxSize: 1, allowedContentTypes: ["*/*"], uploadUrlTtlSeconds: 1, defaultReadUrlTtlSeconds: 1, maxReadUrlTtlSeconds: 2 } } }); const d = createFilesOpenAPIDocument(createFilesOpenAPIApp({ config: c, requestContext: { getActor: () => ({ id: "a" }), getWorkspaceId: () => "w" }, getDriverCapabilities: () => [{ uploadModes: ["proxy"] }] })); expect((d.paths as any)["/api/files/v1/config"].get.operationId).toBe("filesGetConfig"); });
