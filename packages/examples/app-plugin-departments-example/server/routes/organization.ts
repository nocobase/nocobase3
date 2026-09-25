import {
  authenticationToken,
  userAdministrationServiceToken,
} from '@nocobase/app-plugin-authentication';
import {
  authorizationToken,
  type AppAuthorization,
  type AuthorizationEnv,
} from '@nocobase/app-plugin-authorization/server';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { AuthorizationDeniedError } from '@nocobase/authorization/core';
import { databaseManagerToken } from '@nocobase/db';
import { Hono, type Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

import { DIRECTORY_RESOURCE, ORGANIZATION_SETTINGS } from '../resources.js';
import {
  OrganizationError,
  organizationServiceToken,
  type OrganizationErrorCode,
} from '../tokens.js';

type RouteContext = Context<AuthorizationEnv>;

class InputError extends Error {}

const STATUS: Record<OrganizationErrorCode, ContentfulStatusCode> = {
  DEPARTMENT_NOT_FOUND: 404,
  MEMBER_NOT_FOUND: 404,
  DEPARTMENT_EXISTS: 409,
  PARENT_NOT_FOUND: 400,
  PARENT_CYCLE: 400,
  USER_NOT_FOUND: 400,
  INVALID_INPUT: 400,
};

async function requireSettings(
  c: RouteContext,
  action: 'read' | 'update',
): Promise<void> {
  await c.get('authz').require({
    resource: { type: 'settings', id: ORGANIZATION_SETTINGS },
    action,
  });
}

async function readObject(c: RouteContext): Promise<Record<string, unknown>> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new InputError('The request body must be JSON.');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body))
    throw new InputError('The request body must be an object.');
  return body as Record<string, unknown>;
}

function optionalString(
  body: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = body[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !value)
    throw new InputError(`\`${key}\` must be a non-empty string.`);
  return value;
}

function optionalParent(
  body: Record<string, unknown>,
): string | null | undefined {
  if (body.parentId === null) return null;
  return optionalString(body, 'parentId');
}

function optionalInteger(
  body: Record<string, unknown>,
  key: string,
): number | undefined {
  const value = body[key];
  if (value === undefined) return undefined;
  if (!Number.isInteger(value))
    throw new InputError(`\`${key}\` must be an integer.`);
  return value as number;
}

function optionalBoolean(
  body: Record<string, unknown>,
  key: string,
): boolean | undefined {
  const value = body[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'boolean')
    throw new InputError(`\`${key}\` must be a boolean.`);
  return value;
}

function pageQuery(c: RouteContext): {
  search?: string;
  page: number;
  pageSize: number;
} {
  const page = Number(c.req.query('page') ?? '1');
  const pageSize = Number(c.req.query('pageSize') ?? '30');
  const search = c.req.query('search');
  if (
    !Number.isInteger(page) ||
    page < 1 ||
    !Number.isInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > 100
  )
    throw new InputError('Invalid pagination.');
  return { page, pageSize, ...(search ? { search } : {}) };
}

/**
 * The organisation settings API under `/api/departments-example`, and the directory endpoint the department
 * directory page calls. Every route authenticates and authorizes on its own sub-router.
 */
export function createOrganizationRoutes(
  app: AppPluginApplication,
): Hono<AuthorizationEnv> {
  const { container } = app;
  const auth = container.resolve(authenticationToken);
  const authz: AppAuthorization = container.resolve(authorizationToken);
  const organization = container.resolve(organizationServiceToken);
  const users = container.resolve(userAdministrationServiceToken);
  const database = container.resolve(databaseManagerToken);

  // Clients cache their permission snapshot; tell each affected user after the membership write has committed.
  async function refreshUsers(userIds: readonly string[]): Promise<void> {
    for (const id of new Set(userIds))
      await authz.permissionSets.notifyAssignmentsChanged({ type: 'user', id });
  }

  const routes = new Hono<AuthorizationEnv>();
  routes.use('*', auth.required(), authz.middleware());
  routes.onError((error, c) => {
    if (error instanceof AuthorizationDeniedError)
      return c.json({ code: 'FORBIDDEN', message: 'Forbidden' }, 403);
    if (error instanceof InputError)
      return c.json({ code: 'INVALID_INPUT', message: error.message }, 400);
    if (error instanceof OrganizationError)
      return c.json(
        { code: error.code, message: error.message },
        STATUS[error.code],
      );
    throw error;
  });

  routes.get('/departments', async (c) => {
    await requireSettings(c, 'read');
    return c.json({ data: await organization.listTree() });
  });

  routes.post('/departments', async (c) => {
    await requireSettings(c, 'update');
    const body = await readObject(c);
    const id = optionalString(body, 'id');
    const parentId = optionalParent(body);
    const sortOrder = optionalInteger(body, 'sortOrder');
    const department = await organization.createDepartment({
      title: typeof body.title === 'string' ? body.title : '',
      ...(id === undefined ? {} : { id }),
      ...(parentId === undefined ? {} : { parentId }),
      ...(sortOrder === undefined ? {} : { sortOrder }),
    });
    return c.json({ data: department }, 201);
  });

  routes.get('/departments/:id', async (c) => {
    await requireSettings(c, 'read');
    const department = await organization.getDepartment(c.req.param('id'));
    if (!department)
      return c.json(
        { code: 'DEPARTMENT_NOT_FOUND', message: 'Department not found' },
        404,
      );
    return c.json({ data: department });
  });

  routes.patch('/departments/:id', async (c) => {
    await requireSettings(c, 'update');
    const body = await readObject(c);
    const title = optionalString(body, 'title');
    const parentId = optionalParent(body);
    const sortOrder = optionalInteger(body, 'sortOrder');
    const result = await organization.updateDepartment(c.req.param('id'), {
      ...(title === undefined ? {} : { title }),
      ...(parentId === undefined ? {} : { parentId }),
      ...(sortOrder === undefined ? {} : { sortOrder }),
    });
    await refreshUsers(result.changed);
    return c.json({ data: result.department });
  });

  routes.put('/departments/:id/active', async (c) => {
    await requireSettings(c, 'update');
    const active = optionalBoolean(await readObject(c), 'active');
    if (active === undefined) throw new InputError('`active` is required.');
    const changed = await organization.setActive(c.req.param('id'), active);
    await refreshUsers(changed);
    return c.json({ data: { changed } });
  });

  routes.get('/departments/:id/members', async (c) => {
    await requireSettings(c, 'read');
    return c.json({
      data: await organization.directMembers(c.req.param('id')),
    });
  });

  routes.post('/departments/:id/members', async (c) => {
    await requireSettings(c, 'update');
    const body = await readObject(c);
    const userId = optionalString(body, 'userId');
    if (userId === undefined) throw new InputError('`userId` is required.');
    const primary = optionalBoolean(body, 'primary');
    const changed = await organization.addMember({
      departmentId: c.req.param('id'),
      userId,
      ...(primary === undefined ? {} : { primary }),
    });
    await refreshUsers(changed);
    return c.json({ data: { changed } }, 201);
  });

  routes.delete('/departments/:id/members/:userId', async (c) => {
    await requireSettings(c, 'update');
    const changed = await organization.removeMember(
      c.req.param('id'),
      c.req.param('userId'),
    );
    await refreshUsers(changed);
    return c.json({ data: { changed } });
  });

  routes.put('/departments/:id/members/:userId/primary', async (c) => {
    await requireSettings(c, 'update');
    const changed = await organization.setPrimary(
      c.req.param('id'),
      c.req.param('userId'),
    );
    await refreshUsers(changed);
    return c.json({ data: { changed } });
  });

  // Candidates for a new membership: enabled users, searched and paged by the user directory.
  routes.get('/users', async (c) => {
    await requireSettings(c, 'update');
    const query = pageQuery(c);
    const page = await users.list({ ...query, status: 'enabled' });
    return c.json({
      data: {
        items: page.items.map((user) => ({
          id: user.id,
          title: user.name,
          description: user.email,
        })),
        total: page.total,
      },
    });
  });

  // The business endpoint behind the directory page: one decision, its departments policy bound to the query.
  routes.get('/directory', async (c) => {
    const decision = await c.get('authz').authorize({
      resource: { type: 'composite', id: DIRECTORY_RESOURCE },
      action: 'view',
    });
    const policy = decision.conditions?.database?.departments;
    if (decision.effect === 'deny' || !policy)
      return c.json({ code: 'FORBIDDEN', message: 'Forbidden' }, 403);
    // The caller holds `view`, but its data scope selects nothing: a record access that answered `false`, such as
    // a user in no department. A Repository refuses to read under that policy, so answer the empty list here.
    if (policy.read === false) return c.json({ data: [] });
    const rows = await database
      .repository('departments')
      .withPolicy(policy)
      .findMany({
        filter: (f) => f.boolean('active').isTrue(),
        select: (s) => s.fields('id', 'title', 'parentId'),
        sort: (s) => [s.field('title').asc(), s.field('id').asc()],
      });
    return c.json({ data: rows });
  });

  return routes;
}

export const organizationRoutes: AppApiRouteContribution<AppPluginApplication> =
  defineApiRoutes((app) => {
    const router = new Hono();
    router.route('/departments-example', createOrganizationRoutes(app));
    return router;
  });
