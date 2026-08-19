import { randomUUID, timingSafeEqual } from "node:crypto";

import type {
  NocoBaseSession,
  SessionData,
  SessionEnv,
} from "@nocobase/session";
import { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";

import {
  getEmailProviderConfigRevision,
  type EmailProviderDefinition,
} from "../config/providers.js";
import type { EmailProviderRegistry } from "../providers/index.js";
import type {
  NotificationChannel,
  NotificationStatus,
  NotificationStore,
} from "./domain.js";
import {
  getDeliveryDetail,
  listDeliverySummaries,
  NotificationAdminError,
  retryDelivery,
} from "./queries.js";

const csrfCookieName = "notification_csrf";
const temporaryAccessBoundary =
  "TEMPORARY: all authenticated Portal users; remove when Notification AuthorizationPolicy is connected.";
const deliveryStatuses = new Set<NotificationStatus>([
  "queued",
  "sending",
  "accepted",
  "delivered",
  "failed",
  "submission_unknown",
]);
const deliveryChannels = new Set<NotificationChannel>(["in-app", "email"]);

export interface NotificationAdminRouteOptions {
  readonly store: NotificationStore;
  readonly providers?: EmailProviderRegistry;
  readonly providerDefinitions?: readonly EmailProviderDefinition[];
  readonly dispatchDelivery: (deliveryId: string) => Promise<void>;
}

export interface ProviderSummaryDto {
  readonly id: string;
  readonly order: number;
  readonly channel: "email";
  readonly type: "smtp" | "fake";
  readonly enabled: boolean;
  readonly active: boolean;
  readonly configRevision: string;
  readonly connection?: {
    readonly host: string;
    readonly port: number;
    readonly secure: boolean;
  };
  readonly secrets: readonly {
    readonly reference: string;
    readonly configured: boolean;
  }[];
}

export interface ProviderConnectionTestDto {
  readonly providerId: string;
  readonly ok: boolean;
  readonly checkedAt: string;
  readonly error?: { readonly code: string; readonly message: string };
}

export function createNotificationAdminRouter(
  options: NotificationAdminRouteOptions
): Hono<SessionEnv> {
  const router = new Hono<SessionEnv>();

  router.use("*", async (context, next): Promise<Response | void> => {
    const principal = await resolvePrincipal(context.var.session);
    if (!principal)
      return context.json(
        {
          error: {
            code: "NOTIFICATION_ADMIN_UNAUTHENTICATED",
            message: "Authentication is required.",
          },
        },
        401
      );
    await next();
  });

  router.get("/csrf", (context) => {
    const token = randomUUID();
    const requestUrl = new URL(context.req.url);
    setCookie(context, csrfCookieName, token, {
      httpOnly: false,
      sameSite: "Strict",
      secure: requestUrl.protocol === "https:",
      path: "/",
    });
    return context.json({ token, accessBoundary: temporaryAccessBoundary });
  });

  router.get("/deliveries", async (context) => {
    const parsed = parseDeliveryListQuery(context.req.query());
    if (parsed instanceof Response) return parsed;
    return context.json({
      ...(await listDeliverySummaries(options.store, parsed)),
      accessBoundary: temporaryAccessBoundary,
    });
  });

  router.get("/deliveries/:deliveryId", async (context) => {
    const detail = await getDeliveryDetail(
      options.store,
      context.req.param("deliveryId")
    );
    return detail
      ? context.json({ data: detail, accessBoundary: temporaryAccessBoundary })
      : context.json(
          {
            error: {
              code: "NOTIFICATION_DELIVERY_NOT_FOUND",
              message: "Delivery not found.",
            },
          },
          404
        );
  });

  router.post("/deliveries/:deliveryId/retry", async (context) => {
    const csrfError = verifyCsrf(
      context.req.raw,
      getCookie(context, csrfCookieName)
    );
    if (csrfError) return context.json({ error: csrfError }, 403);
    const body = await readJsonObject(context.req.raw);
    const expectedVersion = integerValue(body.expectedVersion);
    if (expectedVersion < 1)
      return context.json(
        {
          error: {
            code: "NOTIFICATION_RETRY_VERSION_INVALID",
            message: "A positive expectedVersion is required.",
          },
        },
        400
      );
    try {
      const actorUserId = await resolvePrincipal(context.var.session);
      const delivery = await retryDelivery(options.store, {
        deliveryId: context.req.param("deliveryId"),
        expectedVersion,
        reason: stringValue(body.reason) ?? "",
        acknowledgeDuplicateRisk: body.acknowledgeDuplicateRisk === true,
        actor: `user:${actorUserId ?? "authenticated"}`,
      });
      await options.dispatchDelivery(delivery.id);
      return context.json(
        {
          data: {
            id: delivery.id,
            status: delivery.status,
            version: delivery.version,
          },
        },
        202
      );
    } catch (error) {
      return adminErrorResponse(error);
    }
  });

  router.get("/providers", (context) =>
    context.json({
      data: listProviderSummaries(
        options.providerDefinitions ?? [],
        options.providers
      ),
      accessBoundary: temporaryAccessBoundary,
    })
  );

  router.post("/providers/:providerId/test", async (context) => {
    const csrfError = verifyCsrf(
      context.req.raw,
      getCookie(context, csrfCookieName)
    );
    if (csrfError) return context.json({ error: csrfError }, 403);
    const result = await testProviderConnection(
      options.providers,
      context.req.param("providerId")
    );
    return context.json({ data: result });
  });

  return router;
}

export function listProviderSummaries(
  definitions: readonly EmailProviderDefinition[],
  providers?: EmailProviderRegistry
): readonly ProviderSummaryDto[] {
  return definitions.map(
    (definition, order): ProviderSummaryDto => ({
      id: definition.id,
      order: order + 1,
      channel: "email",
      type: definition.type,
      enabled: definition.enabled,
      active: providers?.get(definition.id)?.enabled === true,
      configRevision: getEmailProviderConfigRevision(definition),
      connection:
        definition.type === "smtp"
          ? {
              host: definition.host,
              port: definition.port,
              secure: definition.secure,
            }
          : undefined,
      secrets:
        definition.type === "smtp"
          ? [definition.usernameSecret, definition.passwordSecret]
              .filter((reference): reference is string => Boolean(reference))
              .map((reference) => ({
                reference,
                configured: providers?.get(definition.id) !== undefined,
              }))
          : [],
    })
  );
}

export async function testProviderConnection(
  providers: EmailProviderRegistry | undefined,
  providerId: string
): Promise<ProviderConnectionTestDto> {
  const checkedAt = new Date().toISOString();
  const provider = providers?.get(providerId);
  if (!provider || !provider.enabled)
    return {
      providerId,
      ok: false,
      checkedAt,
      error: {
        code: "NOTIFICATION_PROVIDER_UNAVAILABLE",
        message: "Provider is disabled or unavailable.",
      },
    };
  try {
    await provider.provider.checkConnection();
    return { providerId, ok: true, checkedAt };
  } catch (error) {
    return {
      providerId,
      ok: false,
      checkedAt,
      error: {
        code: "NOTIFICATION_PROVIDER_CONNECTION_FAILED",
        message: redactConnectionError(error),
      },
    };
  }
}

function parseDeliveryListQuery(
  query: Record<string, string>
): Parameters<typeof listDeliverySummaries>[1] | Response {
  const status = query.status;
  const channel = query.channel;
  const page = positiveInteger(query.page, 1);
  const pageSize = positiveInteger(query.pageSize, 25);
  if (
    (status && !deliveryStatuses.has(status as NotificationStatus)) ||
    (channel && !deliveryChannels.has(channel as NotificationChannel)) ||
    page === undefined ||
    pageSize === undefined ||
    pageSize > 100 ||
    (query.search?.length ?? 0) > 200
  ) {
    return Response.json(
      {
        error: {
          code: "NOTIFICATION_DELIVERY_FILTER_INVALID",
          message: "Delivery filters are invalid.",
        },
      },
      { status: 400 }
    );
  }
  return {
    status: status as NotificationStatus | undefined,
    channel: channel as NotificationChannel | undefined,
    search: query.search,
    page,
    pageSize,
  };
}

async function resolvePrincipal(
  session: NocoBaseSession | undefined
): Promise<string | undefined> {
  const data = await session?.get();
  return data ? resolveSessionUserId(data) : undefined;
}

function resolveSessionUserId(data: SessionData): string | undefined {
  const user = data.user;
  if (
    user &&
    typeof user === "object" &&
    "id" in user &&
    typeof user.id === "string"
  )
    return user.id;
  return typeof data.userId === "string" ? data.userId : undefined;
}

function verifyCsrf(
  request: Request,
  cookieToken: string | undefined
): { readonly code: string; readonly message: string } | undefined {
  const headerToken = request.headers.get("x-csrf-token") ?? undefined;
  const origin = request.headers.get("origin");
  if (
    !cookieToken ||
    !headerToken ||
    !safeEqual(cookieToken, headerToken) ||
    !origin ||
    new URL(origin).origin !== new URL(request.url).origin
  ) {
    return {
      code: "NOTIFICATION_CSRF_INVALID",
      message: "A valid same-origin CSRF token is required.",
    };
  }
  return undefined;
}

function safeEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return (
    leftBytes.length === rightBytes.length &&
    timingSafeEqual(leftBytes, rightBytes)
  );
}

async function readJsonObject(
  request: Request
): Promise<Record<string, unknown>> {
  try {
    const value: unknown = await request.json();
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function positiveInteger(
  value: string | undefined,
  fallback: number
): number | undefined {
  const parsed = value === undefined ? fallback : Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function integerValue(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) ? value : -1;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function redactConnectionError(error: unknown): string {
  const message =
    error instanceof Error ? error.message : "Provider connection failed.";
  return message
    .replace(/[\w.+-]+@[\w.-]+/g, "[redacted-email]")
    .replace(/((?:password|secret|token)\s*[=:])\s*\S+/gi, "$1[redacted]")
    .slice(0, 500);
}

function adminErrorResponse(error: unknown): Response {
  if (error instanceof NotificationAdminError)
    return Response.json(
      { error: { code: error.code, message: error.message } },
      { status: error.httpStatus }
    );
  throw error;
}
