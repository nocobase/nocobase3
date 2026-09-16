import {
  AuthorizationDeniedError,
  type AuthorizationEnv,
} from '@nocobase/authorization/core';
import type { Auth } from '@nocobase/app-plugin-authentication';
import type { DatabaseConnection } from '@nocobase/db';
import { Hono, type Context } from 'hono';
import type { AppAuthorizationService } from '../tokens.js';
import { permissionSetOptions } from './options.js';
import { createSubjectRoutes } from '../management/options.js';
export function createAuthorizationRoutes(
  auth: Auth,
  authorization: AppAuthorizationService,
  connection?: DatabaseConnection,
): Hono<AuthorizationEnv> {
  const routes = new Hono<AuthorizationEnv>();
  routes.onError((error, context) => {
    if (error instanceof AuthorizationDeniedError)
      return context.json({ code: 'FORBIDDEN', message: error.message }, 403);
    throw error;
  });
  routes.use('*', auth.required());
  routes.use('*', authorization.middleware());
  routes.get('/permissions', (context) =>
    authorization.permissions.handler({
      request: context.req.raw,
      authorization: context.get('authz'),
    }),
  );

  // The application's own endpoints answer first, so a plugin mounted at
  // `/sharing-rules` cannot swallow `/sharing-rules/options`.
  routes.get('/permission-sets/options', async (context) => {
    await admin(context, 'permission-sets', 'read');
    return context.json({
      data: await permissionSetOptions(authorization, connection, context),
    });
  });
  routes.route('/', createSubjectRoutes(authorization, 'permission-sets'));

  routes.post('/inspect/configured', async (context) => {
    await admin(context, 'permission-sets', 'read');
    const input = await body(context);
    const subject = reference(
      input && typeof input === 'object'
        ? Reflect.get(input, 'subject')
        : undefined,
    );
    if (!subject) return context.json({ code: 'INVALID_SUBJECT' }, 400);
    const sets = await authorization.permissionSets.getEffective({
      principal: subject,
      subjects:
        subject.type === 'user' ? [{ type: 'authenticated', id: '*' }] : [],
    });
    return context.json({
      data: {
        unrestricted: sets.some(
          (set) =>
            authorization.permissionSets.protection(set.key)?.unrestricted ===
            true,
        ),
        types: [
          ...new Set(
            sets.flatMap((set) =>
              set.grants
                .filter((grant) => grant.actions.length > 0)
                .map((grant) => grant.resource.type),
            ),
          ),
        ],
      },
    });
  });

  routes.post('/inspect/batch', async (context) => {
    await admin(context, 'permission-sets', 'read');
    const input = await body(context);
    const subject = reference(
      input && typeof input === 'object'
        ? Reflect.get(input, 'subject')
        : undefined,
    );
    const checks: unknown =
      input && typeof input === 'object'
        ? Reflect.get(input, 'checks')
        : undefined;
    if (
      !subject ||
      !Array.isArray(checks) ||
      checks.length === 0 ||
      checks.length > 100
    ) {
      return context.json({ code: 'INVALID_INSPECTION_BATCH' }, 400);
    }
    const requests = checks.map((check: unknown) =>
      check && typeof check === 'object'
        ? readInspectRequest({ ...check, subject })
        : undefined,
    );
    if (requests.some((request) => !request))
      return context.json({ code: 'INVALID_INSPECTION_BATCH' }, 400);
    const scope = authorization.for({
      principal: subject,
      subjects:
        subject.type === 'user' ? [{ type: 'authenticated', id: '*' }] : [],
    });
    const results = [];
    // Bound concurrent rule queries and share one request-scoped grant cache.
    for (let offset = 0; offset < requests.length; offset += 4) {
      results.push(
        ...(await Promise.all(
          requests.slice(offset, offset + 4).map(async (request) => {
            const { resource, action } = request!;
            return {
              resource,
              action,
              decision: await scope.explain({ resource, action }),
            };
          }),
        )),
      );
    }
    return context.json({ data: results });
  });

  // Why one person reaches one resource, built only on the core's explanation
  // so it knows nothing about which plugins an application installed. It
  // reveals another person's access, so it is gated like the Permission Sets it
  // is mostly explaining.
  routes.post('/inspect', async (context) => {
    await admin(context, 'permission-sets', 'read');
    const input = readInspectRequest(await body(context));
    if (!input)
      return context.json(
        {
          code: 'INVALID_BODY',
          message: 'inspect requires a subject, a resource and an action.',
        },
        400,
      );
    // The identity the request middleware builds: the principal, plus the
    // audience subject every signed-in user carries.
    const decision = await authorization
      .for({
        principal: input.subject,
        subjects:
          input.subject.type === 'user'
            ? [{ type: 'authenticated', id: '*' }]
            : [],
      })
      .explain({ resource: input.resource, action: input.action });
    // Passed through as the core gave it: reasons name the plugin they came
    // from, and conditions are not interpreted here.
    return context.json({ data: decision });
  });

  // Everything else is served by whichever Authorization plugin registered the
  // path; one this application did not install registered nothing.
  routes.all('*', async (context, next) => {
    const response = authorization.routes.handle({
      request: context.req.raw,
      path: mountedPath(context),
      authorization: context.get('authz'),
    });
    if (response) return await response;
    await next();
  });
  return routes;
}

/**
 * The request path with the mount removed. Only the dispatcher sees both the
 * full path and the wildcard pattern it matched, so where the application
 * mounted these routes needs no declaration anywhere.
 */
function mountedPath(context: Context<AuthorizationEnv>): string {
  const wildcard = context.req.routePath.indexOf('*');
  const mount =
    wildcard === -1
      ? ''
      : context.req.routePath.slice(0, wildcard).replace(/\/$/, '');
  return context.req.path.slice(mount.length) || '/';
}

/** What the inspector was asked: whose access, on what, doing what. */
interface InspectRequest {
  readonly subject: { type: string; id: string };
  readonly resource: { type: string; id: string };
  readonly action: string;
}

async function body(context: Context): Promise<unknown> {
  try {
    return await context.req.json();
  } catch {
    return undefined;
  }
}

/**
 * The inspect body, checked field by field. Administering settings is what lets
 * someone ask the question, not a reason to trust the shape of what they send.
 */
function readInspectRequest(value: unknown): InspectRequest | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const { subject, resource, action } = value as Record<string, unknown>;
  const [inspected, target] = [reference(subject), reference(resource)];
  if (!inspected || !target || typeof action !== 'string' || action === '')
    return undefined;
  return { subject: inspected, resource: target, action };
}

function reference(value: unknown): { type: string; id: string } | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const { type, id } = value as Record<string, unknown>;
  return typeof type === 'string' &&
    type !== '' &&
    typeof id === 'string' &&
    id !== ''
    ? { type, id }
    : undefined;
}

async function admin(
  context: {
    get(name: 'authz'): {
      require(input: {
        resource: { type: string; id: string };
        action: string;
      }): Promise<void>;
    };
  },
  resourceId: string,
  action: string,
): Promise<void> {
  await context.get('authz').require({
    resource: { type: 'settings', id: `authorization.${resourceId}` },
    action,
  });
}
