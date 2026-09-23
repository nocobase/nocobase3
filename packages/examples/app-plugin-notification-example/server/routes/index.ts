import {
  authenticationToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication';
import { notificationServiceToken } from '@nocobase/app-plugin-notification/server';
import { databaseManagerToken, type DatabaseManager } from '@nocobase/db';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { Hono } from 'hono';

const TASKS = 'notificationExampleTasks';
const USER_PATH = 'user';
const ROUTE_PREFIX = '/notification-example';
const STATUSES = ['open', 'in-progress', 'done'] as const;

type TaskStatus = (typeof STATUSES)[number];

interface TaskRow {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly status: TaskStatus;
  readonly creatorId: string;
  readonly assigneeId: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

interface UserRow {
  readonly id: string;
  readonly name: string;
  readonly email: string;
}

interface TaskInput {
  readonly title?: unknown;
  readonly description?: unknown;
  readonly status?: unknown;
  readonly assigneeId?: unknown;
}

interface NotificationService {
  send(input: {
    readonly idempotencyKey: string;
    readonly source: {
      readonly type: string;
      readonly referenceId: string;
    };
    readonly messages: Record<string, object>;
  }): Promise<unknown>;
}

type NotificationExampleApplication = AppPluginApplication;
type NotificationExampleEnv = AuthEnv;

export const apiRoutes: AppApiRouteContribution<NotificationExampleApplication> =
  defineApiRoutes(({ container }) => {
    const router = new Hono<NotificationExampleEnv>();
    const authentication = container.resolve(authenticationToken);
    const database = container.resolve(databaseManagerToken);
    const notifications = container.resolve(
      notificationServiceToken,
    ) as unknown as NotificationService;

    router.use(ROUTE_PREFIX, authentication.required());
    router.use(`${ROUTE_PREFIX}/*`, authentication.required());

    router.get(`${ROUTE_PREFIX}/users`, async (context) => {
      const users = await listUsers(database);
      return context.json({ data: users });
    });

    router.get(`${ROUTE_PREFIX}/tasks`, async (context) => {
      const userId = context.get('auth')!.user.id;
      const rows = await listTasks(database, userId);
      return context.json({ data: await toTaskViews(database, rows) });
    });

    router.get(`${ROUTE_PREFIX}/tasks/:id`, async (context) => {
      const userId = context.get('auth')!.user.id;
      const row = await findTask(database, context.req.param('id'));
      if (!row || !isTaskRelatedUser(row, userId))
        return error(context, 404, 'TASK_NOT_FOUND', 'Task not found.');
      return context.json({ data: (await toTaskViews(database, [row]))[0] });
    });

    router.post(`${ROUTE_PREFIX}/tasks`, async (context) => {
      const userId = context.get('auth')!.user.id;
      const input = await readInput(context.req.raw);
      const title = requiredText(input.title);
      const description = requiredText(input.description);
      const assigneeId = requiredText(input.assigneeId);
      if (!title || !description || !assigneeId)
        return error(
          context,
          400,
          'TASK_INPUT_INVALID',
          'Title, description, and assignee are required.',
        );
      if (!(await findUser(database, assigneeId)))
        return error(context, 400, 'ASSIGNEE_NOT_FOUND', 'Assignee not found.');

      const timestamp = now();
      const id = crypto.randomUUID();
      await database
        .connection()
        .query.insertInto(TASKS)
        .values({
          id,
          title,
          description,
          status: 'open',
          creatorId: userId,
          assigneeId,
          createdAt: timestamp,
          updatedAt: timestamp,
        })
        .execute();

      const task = (await findTask(database, id))!;
      await sendTaskNotification(notifications, task, assigneeId, 'assigned');
      return context.json(
        { data: (await toTaskViews(database, [task]))[0] },
        201,
      );
    });

    router.patch(`${ROUTE_PREFIX}/tasks/:id`, async (context) => {
      const actorId = context.get('auth')!.user.id;
      const id = context.req.param('id');
      const task = await findTask(database, id);
      if (!task || !isTaskRelatedUser(task, actorId))
        return error(context, 404, 'TASK_NOT_FOUND', 'Task not found.');

      const input = await readInput(context.req.raw);
      const title = optionalText(input.title, task.title);
      const description = optionalText(input.description, task.description);
      const status = optionalStatus(input.status, task.status);
      const assigneeId = optionalText(input.assigneeId, task.assigneeId);
      if (!title || !description || !status || !assigneeId)
        return error(
          context,
          400,
          'TASK_INPUT_INVALID',
          'Task values are invalid.',
        );
      if (assigneeId !== task.assigneeId && actorId !== task.creatorId)
        return error(
          context,
          403,
          'TASK_ASSIGNMENT_FORBIDDEN',
          'Only the task creator can reassign a task.',
        );
      if (
        assigneeId !== task.assigneeId &&
        !(await findUser(database, assigneeId))
      )
        return error(context, 400, 'ASSIGNEE_NOT_FOUND', 'Assignee not found.');

      const updatedAt = now();
      await database
        .connection()
        .query.updateTable(TASKS)
        .set({ title, description, status, assigneeId, updatedAt })
        .where('id', '=', id)
        .execute();

      const updated = (await findTask(database, id))!;
      const recipientIds = [task.creatorId, task.assigneeId, assigneeId].filter(
        (recipientId, index, recipients) =>
          recipientId !== actorId && recipients.indexOf(recipientId) === index,
      );
      await Promise.all(
        recipientIds.map((recipientId) =>
          sendTaskNotification(notifications, updated, recipientId, 'updated'),
        ),
      );
      return context.json({
        data: (await toTaskViews(database, [updated]))[0],
      });
    });

    return router as unknown as Hono;
  });

const routes: readonly AppApiRouteContribution<NotificationExampleApplication>[] =
  [apiRoutes];

export default routes;

function now(): string {
  return new Date().toISOString().replace(/Z$/u, '');
}

function requiredText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function optionalText(value: unknown, fallback: string): string | undefined {
  return value === undefined ? fallback : requiredText(value);
}

function optionalStatus(
  value: unknown,
  fallback: TaskStatus,
): TaskStatus | undefined {
  if (value === undefined) return fallback;
  return typeof value === 'string' && STATUSES.includes(value as TaskStatus)
    ? (value as TaskStatus)
    : undefined;
}

function isTaskRelatedUser(task: TaskRow, userId: string): boolean {
  return task.creatorId === userId || task.assigneeId === userId;
}

async function readInput(request: Request): Promise<TaskInput> {
  const body: unknown = await request.json().catch(() => undefined);
  return body && typeof body === 'object' && !Array.isArray(body) ? body : {};
}

async function findUser(
  database: DatabaseManager,
  id: string,
): Promise<UserRow | undefined> {
  const row = await database
    .connection()
    .query.selectFrom(USER_PATH)
    .select(['id', 'name', 'email'])
    .where('id', '=', id)
    .where('disabledAt', 'is', null)
    .where('deletedAt', 'is', null)
    .executeTakeFirst();
  return row as UserRow | undefined;
}

async function listUsers(database: DatabaseManager): Promise<UserRow[]> {
  const rows = await database
    .connection()
    .query.selectFrom(USER_PATH)
    .select(['id', 'name', 'email'])
    .where('disabledAt', 'is', null)
    .where('deletedAt', 'is', null)
    .orderBy('name', 'asc')
    .execute();
  return rows as unknown as UserRow[];
}

async function findTask(
  database: DatabaseManager,
  id: string,
): Promise<TaskRow | undefined> {
  const row = await database
    .connection()
    .query.selectFrom(TASKS)
    .selectAll()
    .where('id', '=', id)
    .executeTakeFirst();
  return row as TaskRow | undefined;
}

async function listTasks(
  database: DatabaseManager,
  userId: string,
): Promise<TaskRow[]> {
  const rows = await database
    .connection()
    .query.selectFrom(TASKS)
    .selectAll()
    .where((expression) =>
      expression.or([
        expression('creatorId', '=', userId),
        expression('assigneeId', '=', userId),
      ]),
    )
    .orderBy('updatedAt', 'desc')
    .execute();
  return rows as unknown as TaskRow[];
}

async function toTaskViews(
  database: DatabaseManager,
  rows: readonly TaskRow[],
): Promise<readonly Record<string, unknown>[]> {
  const ids = [
    ...new Set(rows.flatMap((row) => [row.creatorId, row.assigneeId])),
  ];
  const users = await Promise.all(ids.map((id) => findUser(database, id)));
  const byId = new Map(users.filter(Boolean).map((user) => [user!.id, user!]));
  return rows.map((row) => ({
    ...row,
    creator: byId.get(row.creatorId) ?? { id: row.creatorId },
    assignee: byId.get(row.assigneeId) ?? { id: row.assigneeId },
  }));
}

async function sendTaskNotification(
  notifications: NotificationService,
  task: TaskRow,
  recipientId: string,
  event: 'assigned' | 'updated',
): Promise<void> {
  await notifications.send({
    idempotencyKey: `notification-example:task:${task.id}:${event}:${task.updatedAt}:${recipientId}`,
    source: {
      type: `notification-example.task-${event}`,
      referenceId: task.id,
    },
    messages: {
      inbox: {
        to: recipientId,
        title:
          event === 'assigned'
            ? `New task: ${task.title}`
            : `Task updated: ${task.title}`,
        body: [
          `Task: ${task.title}`,
          `Description: ${task.description}`,
          `Status: ${task.status}`,
        ].join('\n'),
        target: { type: 'route', path: `${ROUTE_PREFIX}/tasks/${task.id}` },
      },
    },
  });
}

function error(
  context: { json: (body: unknown, status?: number) => Response },
  status: 400 | 403 | 404,
  code: string,
  message: string,
): Response {
  return context.json({ code, message }, status);
}
