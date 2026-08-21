import type {
  NocoBaseSession,
  SessionData,
  SessionEnv,
} from "@nocobase/session";
import { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import type { InAppStore } from "./store.js";

export function createInAppRouter(store: InAppStore): Hono<SessionEnv> {
  const router = new Hono<SessionEnv>();
  router.use("*", async (context, next) => {
    if (!(await userId(context.var.session)))
      return context.json({ error: "Authentication required." }, 401);
    await next();
  });
  router.get("/csrf", (context) => {
    const token = crypto.randomUUID();
    setCookie(context, "notification_in_app_csrf", token, {
      httpOnly: false,
      sameSite: "Strict",
      path: "/",
    });
    return context.json({ token });
  });
  router.get("/", async (context) =>
    context.json({
      data: await store.list({
        userId: (await userId(context.var.session))!,
        unreadOnly: context.req.query("unreadOnly") === "true",
        limit: Number(context.req.query("limit") ?? 25),
      }),
    }),
  );
  router.get("/unread-count", async (context) =>
    context.json({
      count: await store.countUnread((await userId(context.var.session))!),
    }),
  );
  router.post("/read-all", async (context) => {
    if (
      !validCsrf(
        context.req.header("x-csrf-token"),
        getCookie(context, "notification_in_app_csrf"),
      )
    )
      return context.json({ error: "Invalid CSRF token." }, 403);
    return context.json({
      updated: await store.markAllRead((await userId(context.var.session))!),
    });
  });
  router.post("/:id", async (context) => {
    if (
      !validCsrf(
        context.req.header("x-csrf-token"),
        getCookie(context, "notification_in_app_csrf"),
      )
    )
      return context.json({ error: "Invalid CSRF token." }, 403);
    const body = await context.req.json<{
      action?: "read" | "unread" | "delete";
      expectedVersion?: number;
    }>();
    const updated = await store.update({
      id: context.req.param("id"),
      userId: (await userId(context.var.session))!,
      action: body.action ?? "read",
      expectedVersion: body.expectedVersion ?? 0,
    });
    return updated
      ? context.json({ data: updated })
      : context.json({ error: "Not found or version conflict." }, 409);
  });
  return router;
}
async function userId(
  session: NocoBaseSession | undefined,
): Promise<string | undefined> {
  const data = await session?.get();
  return data ? sessionUser(data) : undefined;
}
function sessionUser(data: SessionData): string | undefined {
  return typeof data.userId === "string"
    ? data.userId
    : data.user &&
        typeof data.user === "object" &&
        "id" in data.user &&
        typeof data.user.id === "string"
      ? data.user.id
      : undefined;
}
function validCsrf(
  header: string | undefined,
  cookie: string | undefined,
): boolean {
  return Boolean(header && cookie && header === cookie);
}
