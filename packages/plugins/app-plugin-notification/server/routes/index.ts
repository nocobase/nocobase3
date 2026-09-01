import {
  authenticationToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication';
import {
  authorizationToken,
  type AuthorizationEnv,
} from '@nocobase/app-plugin-authorization';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { Hono } from 'hono';

import { notificationConfig } from '../config.js';
import { notificationServiceToken } from '../tokens.js';
import type { NotificationProviderApplicationConfig } from '../providers/notification.js';

type NotificationRoutesEnv = {
  Variables: AuthEnv['Variables'] & AuthorizationEnv['Variables'];
};

const TEST_HEADER = 'x-nocobase-notification-test';

export const apiRoutes: AppApiRouteContribution<
  AppPluginApplication<NotificationProviderApplicationConfig>
> = defineApiRoutes(({ config, container }) => {
  const router = new Hono();
  const notification = container.resolve(notificationServiceToken);
  const auth = container.resolve(authenticationToken);
  const authorization = container.resolve(authorizationToken);

  const logs = new Hono<NotificationRoutesEnv>();
  logs.use('/logs/:id?', auth.required(), authorization.middleware());
  logs.use('/logs/:id?', async (context, next) => {
    const allowed = await context.get('authz').can({
      resource: { type: 'page', id: 'notification.logs' },
      action: 'access',
    });
    if (!allowed) {
      return context.json(
        { error: 'Notification logs access is required.' },
        403,
      );
    }
    await next();
  });
  logs.route('/', notification.router);

  const tests = new Hono<NotificationRoutesEnv>();
  tests.use('*', auth.required(), authorization.middleware());
  tests.use('*', async (context, next) => {
    if (!config.get(notificationConfig).test?.enabled) {
      return context.json({ error: 'Not found.' }, 404);
    }
    if (context.req.header(TEST_HEADER) !== '1') {
      return context.json({ error: 'Missing notification test header.' }, 403);
    }
    const allowed = await context.get('authz').can({
      resource: { type: 'notification', id: 'test' },
      action: 'send',
    });
    if (!allowed) {
      return context.json(
        { error: 'Notification test send permission is required.' },
        403,
      );
    }
    await next();
  });
  tests.get('/targets', (context) =>
    context.json({ data: notification.listTestTargets() }),
  );
  tests.post('/send', async (context) => {
    const request = await readTestRequest(context.req.raw);
    if (!request) {
      return context.json(
        { error: 'Request body must contain a test target and field values.' },
        400,
      );
    }
    try {
      const result = await notification.sendTest(request, {
        userId: context.get('auth')!.user.id,
      });
      return context.json({ data: result }, 202);
    } catch (error) {
      return context.json(
        {
          error:
            error instanceof Error
              ? error.message
              : 'Notification test failed.',
        },
        400,
      );
    }
  });
  tests.get('/:id/status', async (context) => {
    const details = await notification.getTestStatus(context.req.param('id'), {
      userId: context.get('auth')!.user.id,
    });
    return details
      ? context.json({ data: details })
      : context.json({ error: 'Notification test not found.' }, 404);
  });

  router.route('/notifications', logs);
  router.route('/notifications/test', tests);
  return router;
});

const routes: readonly AppApiRouteContribution<
  AppPluginApplication<NotificationProviderApplicationConfig>
>[] = [apiRoutes];

export default routes;

async function readTestRequest(
  request: Request,
): Promise<import('../types.js').NotificationTestSendRequest | undefined> {
  const body: unknown = await request.json().catch(() => undefined);
  if (!isRecord(body) || !isRecord(body.values)) return undefined;
  if (
    typeof body.channel !== 'string' ||
    typeof body.providerName !== 'string' ||
    typeof body.providerType !== 'string'
  )
    return undefined;
  const values: Record<string, string> = Object.create(null) as Record<
    string,
    string
  >;
  for (const [name, value] of Object.entries(body.values)) {
    if (typeof value !== 'string') return undefined;
    values[name] = value;
  }
  return {
    channel: body.channel,
    providerName: body.providerName,
    providerType: body.providerType,
    values,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
