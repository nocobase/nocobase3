import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { PublicFilesConfigSchema, SuccessEnvelopeSchema } from "../contracts/index.ts";
import { createPublicFilesConfig, type DriverCapabilities, type ValidatedFilesConfig } from "../config/index.ts";
import { resolveFilesRequestContext, type HonoContextLike } from "../authorization/index.ts";
import type { FileRequestContextResolver } from "../module-types.ts";
import { filesErrorResponse } from "../errors/index.ts";
export interface CreateFilesRouterFoundationOptions { config: ValidatedFilesConfig; requestContext: FileRequestContextResolver; getDriverCapabilities: () => DriverCapabilities[]; logger?: { error(error: unknown): void } }
export function createFilesOpenAPIApp(options: CreateFilesRouterFoundationOptions) {
  const app = new OpenAPIHono();
  app.openapi(createRoute({ method: "get", path: "/config", operationId: "filesGetConfig", responses: { 200: { content: { "application/json": { schema: SuccessEnvelopeSchema(PublicFilesConfigSchema) } }, description: "Public files configuration" }, 401: { description: "Unauthorized" }, 403: { description: "Forbidden" }, 500: { description: "Internal error" } } }), (async (c: any) => {
    try { await resolveFilesRequestContext(c as unknown as HonoContextLike, options.requestContext); return c.json({ data: createPublicFilesConfig(options.config, options.getDriverCapabilities()) }, 200); }
    catch (error) { const mapped = filesErrorResponse(error); options.logger?.error(error); return c.json(mapped.body, mapped.status as 401 | 403 | 500); }
  }) as any);
  return app;
}
