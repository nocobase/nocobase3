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
import {
  getRequestTranslator,
  isAppI18nError,
  type Translator,
} from '@nocobase/i18n/server';

import { notificationConfig } from '../config.js';
import { notificationRuntimeToken } from '../runtime.js';
import { isNotificationTestSendRequest } from '../test-contract.js';
import type { NotificationProviderApplicationConfig } from '../providers/notification.js';
import { notificationTestError } from '../types.js';
import type {
  NotificationI18nText,
  NotificationTestTargetDescriptor,
} from '../types.js';

type NotificationRoutesEnv = {
  Variables: AuthEnv['Variables'] & AuthorizationEnv['Variables'];
};

const TEST_HEADER = 'x-nocobase-notification-test';

export const apiRoutes: AppApiRouteContribution<
  AppPluginApplication<NotificationProviderApplicationConfig>
> = defineApiRoutes(({ config, container }) => {
  const router = new Hono();
  const notification = container.resolve(notificationRuntimeToken);
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
  tests.onError((error, context) => {
    if (!isAppI18nError(error)) throw error;
    const t = getRequestTranslator(context, error.ns);
    return context.json(
      {
        error: {
          code: error.code,
          message: t(error.key, error.params),
          ns: error.ns,
          key: error.key,
          ...(error.params ? { params: error.params } : {}),
        },
      },
      error.status as 400,
    );
  });
  tests.use('*', auth.required(), authorization.middleware());
  tests.use('*', async (context, next) => {
    if (!config.get(notificationConfig).test?.enabled) {
      throw notificationTestError(
        'NOTIFICATION_TEST_DISABLED',
        'errors.testDisabled',
        { status: 404 },
      );
    }
    if (context.req.header(TEST_HEADER) !== '1') {
      throw notificationTestError(
        'NOTIFICATION_TEST_HEADER_REQUIRED',
        'errors.testHeaderRequired',
        { status: 403 },
      );
    }
    const allowed = await context.get('authz').can({
      resource: { type: 'notification', id: 'test' },
      action: 'send',
    });
    if (!allowed) {
      throw notificationTestError(
        'NOTIFICATION_TEST_FORBIDDEN',
        'errors.testForbidden',
        { status: 403 },
      );
    }
    await next();
  });
  tests.get('/targets', (context) => {
    const t = getRequestTranslator(context);
    return context.json({
      data: notification
        .listTestTargets()
        .map((target) => localizeTestTarget(target, t)),
    });
  });
  tests.post('/send', async (context) => {
    const request = await readTestRequest(context.req.raw);
    if (!request) {
      throw notificationTestError(
        'NOTIFICATION_TEST_INVALID_REQUEST',
        'errors.testInvalidRequest',
      );
    }
    try {
      const result = await notification.sendTest(request, {
        userId: context.get('auth')!.user.id,
      });
      return context.json({ data: result }, 202);
    } catch (error) {
      if (isAppI18nError(error)) throw error;
      throw notificationTestError(
        'NOTIFICATION_TEST_FAILED',
        'errors.testFailed',
        { cause: error },
      );
    }
  });
  tests.get('/:id/status', async (context) => {
    const details = await notification.getTestStatus(context.req.param('id'), {
      userId: context.get('auth')!.user.id,
    });
    if (!details) {
      throw notificationTestError(
        'NOTIFICATION_TEST_NOT_FOUND',
        'errors.testNotFound',
        { status: 404 },
      );
    }
    return context.json({ data: details });
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
  return isNotificationTestSendRequest(body) ? body : undefined;
}

function localizeTestTarget(
  target: NotificationTestTargetDescriptor,
  t: Translator,
): NotificationTestTargetDescriptor<string> {
  return {
    channel: {
      type: target.channel.type,
      label: translateText(target.channel.label, t),
    },
    provider: {
      name: target.provider.name,
      type: target.provider.type,
      label: translateText(target.provider.label, t),
    },
    fields: target.fields.map((field) => ({
      name: field.name,
      label: translateText(field.label, t),
      type: field.type,
      ...(field.required === undefined ? {} : { required: field.required }),
      ...(field.placeholder === undefined
        ? {}
        : { placeholder: translateText(field.placeholder, t) }),
      ...(field.defaultValue === undefined
        ? {}
        : { defaultValue: translateText(field.defaultValue, t) }),
      ...(field.maxLength === undefined ? {} : { maxLength: field.maxLength }),
    })),
  };
}

function translateText(
  text: string | NotificationI18nText,
  t: Translator,
): string {
  return typeof text === 'string'
    ? text
    : t(text.key, { ns: text.ns, defaultValue: text.defaultValue });
}
