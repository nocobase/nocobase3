import type {
  Authorization,
  AuthorizationContext,
  AuthorizationDecision,
  AuthorizationRouteHandler,
  AuthorizationSubject,
  ResourceRef,
} from '@nocobase/authorization/core';
import type { PermissionSetsApi } from '@nocobase/authorization/permission-sets';
import {
  createRouteHandler,
  createSettingsRouter,
  jsonBody,
  requireSettings,
} from '../extension/http.js';
import { createSubjectRoutes } from '../extension/options.js';
import type { AuthorizationExtensionHost } from '../host.js';
import { authorizationOptions } from '../options.js';

export const INSPECTOR_SETTINGS = 'authorization.inspector';

/** A decision, with the underlying checks of a business action. */
export type InspectedDecision = AuthorizationDecision & {
  readonly checks?: readonly unknown[];
};

interface InspectRequest {
  readonly subject: AuthorizationSubject;
  readonly resource: ResourceRef;
  readonly action: string;
}

/** Every `/inspector` route, gated by `settings:authorization.inspector` `inspect`. */
export function createInspectorHandler(
  host: AuthorizationExtensionHost & Pick<Authorization, 'for'>,
  permissionSets: Pick<PermissionSetsApi, 'getEffective' | 'protection'>,
): AuthorizationRouteHandler {
  const routes = createSettingsRouter();
  const require = (authorization: AuthorizationContext) =>
    requireSettings(authorization, INSPECTOR_SETTINGS, 'inspect');
  // The identity the request middleware builds for this subject.
  const contextFor = async (
    subject: AuthorizationSubject,
  ): Promise<AuthorizationContext> =>
    host.for({
      principal: subject,
      subjects: [
        ...(subject.type === 'user'
          ? [{ type: 'authenticated', id: '*' }]
          : []),
        ...(await host.subjects.resolveFor(subject)),
      ],
    });

  routes.get('/inspector/options', async (context) => {
    await require(context.env.authorization);
    return context.json({ data: await authorizationOptions(host) });
  });
  routes.route(
    '/',
    createSubjectRoutes(host, '/inspector', INSPECTOR_SETTINGS, 'inspect'),
  );
  routes.post('/inspector/decision', async (context) => {
    await require(context.env.authorization);
    const input = readInspectRequest(await jsonBody(context.req));
    if (!input)
      return context.json(
        {
          code: 'INVALID_AUTHORIZATION_INPUT',
          message: 'A decision needs a subject, a resource and an action.',
        },
        400,
      );
    const inspected = await contextFor(input.subject);
    return context.json({
      data: await decide(inspected, input.resource, input.action),
    });
  });
  routes.post('/inspector/batch', async (context) => {
    await require(context.env.authorization);
    const input = await jsonBody(context.req);
    const subject = reference(
      input && typeof input === 'object'
        ? Reflect.get(input, 'subject')
        : undefined,
    );
    const checks: unknown =
      input && typeof input === 'object'
        ? Reflect.get(input, 'checks')
        : undefined;
    const requests =
      subject &&
      Array.isArray(checks) &&
      checks.length > 0 &&
      checks.length <= 100
        ? checks.map((check: unknown) =>
            check && typeof check === 'object'
              ? readInspectRequest({ ...check, subject })
              : undefined,
          )
        : undefined;
    if (!subject || !requests || requests.some((request) => !request))
      return context.json({ code: 'INVALID_AUTHORIZATION_INPUT' }, 400);
    const inspected = await contextFor(subject);
    const results = [];
    // Bounded concurrency; the context shares one grant and rule cache.
    for (let offset = 0; offset < requests.length; offset += 4)
      results.push(
        ...(await Promise.all(
          requests.slice(offset, offset + 4).map(async (request) => ({
            resource: request!.resource,
            action: request!.action,
            decision: await decide(
              inspected,
              request!.resource,
              request!.action,
            ),
          })),
        )),
      );
    return context.json({ data: results });
  });
  routes.post('/inspector/configured', async (context) => {
    await require(context.env.authorization);
    const input = await jsonBody(context.req);
    const subject = reference(
      input && typeof input === 'object'
        ? Reflect.get(input, 'subject')
        : undefined,
    );
    if (!subject)
      return context.json({ code: 'INVALID_AUTHORIZATION_INPUT' }, 400);
    const sets = await permissionSets.getEffective({
      principal: subject,
      subjects: [
        ...(subject.type === 'user'
          ? [{ type: 'authenticated', id: '*' }]
          : []),
        ...(await host.subjects.resolveFor(subject)),
      ],
    });
    const resources = [
      ...new Map(
        sets.flatMap((set) =>
          set.grants
            .filter((grant) => grant.actions.length > 0)
            .map(
              (grant) =>
                [JSON.stringify(grant.resource), grant.resource] as const,
            ),
        ),
      ).values(),
    ];
    return context.json({
      data: {
        unrestricted: sets.some(
          (set) => permissionSets.protection(set.key)?.unrestricted === true,
        ),
        types: [...new Set(resources.map((resource) => resource.type))],
        resources,
      },
    });
  });
  return createRouteHandler(routes);
}

async function decide(
  context: AuthorizationContext,
  resource: ResourceRef,
  action: string,
): Promise<InspectedDecision> {
  const decision = await context.authorize({ resource, action });
  if (resource.type !== 'business') return decision;
  const checks: unknown = decision.conditions?.checks;
  return { ...decision, checks: Array.isArray(checks) ? checks : [] };
}

function readInspectRequest(value: unknown): InspectRequest | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const { subject, resource, action } = value as Record<string, unknown>;
  const [inspected, target] = [reference(subject), reference(resource)];
  if (!inspected || !target || typeof action !== 'string' || action === '')
    return undefined;
  return { subject: inspected, resource: target, action };
}

function reference(value: unknown): ResourceRef | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const { type, id } = value as Record<string, unknown>;
  return typeof type === 'string' &&
    type !== '' &&
    typeof id === 'string' &&
    id !== ''
    ? { type, id }
    : undefined;
}
