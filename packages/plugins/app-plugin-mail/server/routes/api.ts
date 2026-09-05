import {
  authenticationToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication';
import {
  authorizationToken,
  type AuthorizationEnv,
} from '@nocobase/app-plugin-authorization';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import { appConfig } from '@nocobase/app-server/config';
import { joinBasePath } from '@nocobase/app-server/support';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { Hono } from 'hono';
import { getRequestTranslator } from '@nocobase/i18n/server';

import { mailServiceToken } from '../tokens.js';
import { MailIdempotencyConflictError } from '../operations/send-mail.js';
import type {
  MailAddress,
  MailComposeInput,
  MailListMessagesInput,
  MailStartSyncInput,
} from '../types.js';

type MailRoutesEnv = {
  Variables: AuthEnv['Variables'] & AuthorizationEnv['Variables'];
};

const MAIL_NAMESPACE = '@nocobase/app-plugin-mail';

export const mailApiRoutes: AppApiRouteContribution<AppPluginApplication> =
  defineApiRoutes(({ container, config, publicBasePath }) => {
    const router = new Hono();
    const routes = new Hono<MailRoutesEnv>();
    const authentication = container.resolve(authenticationToken);
    const authorization = container.resolve(authorizationToken);
    const mail = container.resolve(mailServiceToken);

    routes.use(
      '*',
      authentication.required(),
      authorization.middleware(),
      async (context, next) => {
        const allowed = await context.get('authz').can({
          resource: { type: 'page', id: 'mail.settings' },
          action: 'access',
        });
        if (!allowed) {
          const t = getRequestTranslator(context, MAIL_NAMESPACE);
          return context.json(
            {
              error: {
                code: 'MAIL_ACCESS_DENIED',
                message: t('errors.accessDenied'),
              },
            },
            403,
          );
        }
        await next();
      },
    );
    routes.onError((error, context) => {
      const t = getRequestTranslator(context, MAIL_NAMESPACE);
      if (error instanceof MailIdempotencyConflictError) {
        return context.json(
          {
            error: {
              code: 'MAIL_IDEMPOTENCY_CONFLICT',
              message: t('errors.idempotencyConflict'),
            },
          },
          409,
        );
      }
      const invalid = error instanceof TypeError;
      return context.json(
        {
          error: {
            code: invalid ? 'INVALID_MAIL_REQUEST' : 'MAIL_REQUEST_FAILED',
            message: t(
              invalid ? 'errors.invalidRequest' : 'errors.requestFailed',
            ),
          },
        },
        invalid ? 400 : 422,
      );
    });

    routes.get('/accounts', async (context) =>
      context.json({
        data: await mail.listAccounts(operationContext(context)),
      }),
    );
    routes.get('/providers', async (context) =>
      context.json({ data: await mail.listProviders() }),
    );
    routes.post('/authorizations', async (context) => {
      const value = await readObject(context.req.raw);
      const identity = config.get(appConfig);
      const origin = identity.publicOrigin ?? new URL(context.req.url).origin;
      return context.json({
        data: await mail.startAuthorization(operationContext(context), {
          provider: {
            type: requiredString(value.type, 'type'),
            name: requiredString(value.name, 'name'),
          },
          redirectUri: new URL(
            joinBasePath(publicBasePath, '/mail/oauth/callback'),
            origin,
          ).toString(),
          scopes: optionalStringArray(value.scopes, 'scopes'),
        }),
      });
    });
    routes.get('/accounts/:accountId/identities', async (context) =>
      context.json({
        data: await mail.listIdentities(
          operationContext(context),
          context.req.param('accountId'),
        ),
      }),
    );
    routes.get('/accounts/:accountId/folders', async (context) =>
      context.json({
        data: await mail.listFolders(
          operationContext(context),
          context.req.param('accountId'),
        ),
      }),
    );
    routes.post('/messages/send', async (context) => {
      const input = await readComposeInput(context.req.raw);
      return context.json(
        { data: await mail.sendMessage(operationContext(context), input) },
        200,
      );
    });
    routes.post('/accounts/:accountId/sync', async (context) => {
      const input = await readSyncInput(
        context.req.raw,
        context.req.param('accountId'),
      );
      return context.json(
        { data: await mail.startSync(operationContext(context), input) },
        202,
      );
    });
    routes.get('/sync-runs/:syncRunId', async (context) => {
      const t = getRequestTranslator(context, MAIL_NAMESPACE);
      const run = await mail.getSyncRun(
        operationContext(context),
        context.req.param('syncRunId'),
      );
      return run
        ? context.json({ data: run })
        : context.json(
            {
              error: {
                code: 'MAIL_SYNC_RUN_NOT_FOUND',
                message: t('errors.syncRunNotFound'),
              },
            },
            404,
          );
    });
    routes.get('/messages', async (context) => {
      const accountId = context.req.query('accountId');
      const folderId = context.req.query('folderId');
      const input: MailListMessagesInput = {
        accountIds: accountId ? [accountId] : undefined,
        folderIds: folderId ? [folderId] : undefined,
        conversationId: context.req.query('conversationId'),
        query: context.req.query('query'),
        cursor: context.req.query('cursor'),
        limit: optionalInteger(context.req.query('limit'), 'limit'),
        unread: optionalBoolean(context.req.query('unread'), 'unread'),
        starred: optionalBoolean(context.req.query('starred'), 'starred'),
      };
      return context.json({
        data: await mail.listMessages(operationContext(context), input),
      });
    });
    routes.get(
      '/accounts/:accountId/conversations/:conversationId/messages',
      async (context) =>
        context.json({
          data: await mail.listConversationMessages(
            operationContext(context),
            context.req.param('accountId'),
            context.req.param('conversationId'),
            {
              cursor: context.req.query('cursor'),
              limit: optionalInteger(context.req.query('limit'), 'limit'),
            },
          ),
        }),
    );
    routes.get('/accounts/:accountId/messages/:messageId', async (context) => {
      const t = getRequestTranslator(context, MAIL_NAMESPACE);
      const message = await mail.getMessage(
        operationContext(context),
        context.req.param('accountId'),
        context.req.param('messageId'),
      );
      return message
        ? context.json({ data: message })
        : context.json(
            {
              error: {
                code: 'MAIL_MESSAGE_NOT_FOUND',
                message: t('errors.messageNotFound'),
              },
            },
            404,
          );
    });

    router.route('/mail', routes);
    return router;
  });

function operationContext(context: {
  get(
    key: 'auth',
  ): NonNullable<import('@nocobase/app-plugin-authentication').AuthSession>;
}): { actorId: string } {
  return { actorId: context.get('auth').user.id };
}

async function readComposeInput(request: Request): Promise<MailComposeInput> {
  const value = await readObject(request);
  const accountId = requiredString(value.accountId, 'accountId');
  const identityId = requiredString(value.identityId, 'identityId');
  const subject = requiredString(value.subject, 'subject');
  const text = requiredString(value.text, 'text');
  const idempotencyKey = requiredString(value.idempotencyKey, 'idempotencyKey');
  return {
    accountId,
    identityId,
    to: addresses(value.to, 'to'),
    cc: optionalAddresses(value.cc, 'cc'),
    bcc: optionalAddresses(value.bcc, 'bcc'),
    subject,
    text,
    html: optionalString(value.html, 'html'),
    attachmentIds: optionalStringArray(value.attachmentIds, 'attachmentIds'),
    idempotencyKey,
  };
}

async function readSyncInput(
  request: Request,
  accountId: string,
): Promise<MailStartSyncInput> {
  const text = await request.text();
  if (!text) return { accountId };
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new TypeError('Mail sync request must contain valid JSON.');
  }
  if (!isRecord(value))
    throw new TypeError('Mail sync request must be an object.');
  const mode = value.mode;
  if (mode !== undefined && mode !== 'initial' && mode !== 'incremental') {
    throw new TypeError('Mail sync mode must be initial or incremental.');
  }
  return {
    accountId,
    mode,
    receivedAfter: optionalString(value.receivedAfter, 'receivedAfter'),
    maxMessages: optionalInteger(value.maxMessages, 'maxMessages'),
    batchSize: optionalInteger(value.batchSize, 'batchSize'),
  };
}

async function readObject(request: Request): Promise<Record<string, unknown>> {
  let value: unknown;
  try {
    value = await request.json();
  } catch {
    throw new TypeError('Mail request must contain valid JSON.');
  }
  if (!isRecord(value)) throw new TypeError('Mail request must be an object.');
  return value;
}

function addresses(value: unknown, field: string): readonly MailAddress[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new TypeError(
      `Mail field "${field}" must contain at least one address.`,
    );
  }
  return value.map((item) => address(item, field));
}

function optionalAddresses(
  value: unknown,
  field: string,
): readonly MailAddress[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value))
    throw new TypeError(`Mail field "${field}" must be an array.`);
  return value.map((item) => address(item, field));
}

function address(value: unknown, field: string): MailAddress {
  if (!isRecord(value))
    throw new TypeError(`Mail field "${field}" contains an invalid address.`);
  return {
    address: requiredString(value.address, `${field}.address`),
    name: optionalString(value.name, `${field}.name`),
  };
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`Mail field "${field}" must be a non-empty string.`);
  }
  return value;
}

function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string')
    throw new TypeError(`Mail field "${field}" must be a string.`);
  return value;
}

function optionalStringArray(
  value: unknown,
  field: string,
): readonly string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    throw new TypeError(`Mail field "${field}" must be an array.`);
  }
  return value.map((item) => requiredString(item, field));
}

function optionalInteger(value: unknown, field: string): number | undefined {
  if (value === undefined) return undefined;
  const number = typeof value === 'string' ? Number(value) : value;
  if (typeof number !== 'number' || !Number.isSafeInteger(number)) {
    throw new TypeError(`Mail field "${field}" must be an integer.`);
  }
  return number;
}

function optionalBoolean(value: unknown, field: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  throw new TypeError(`Mail field "${field}" must be a boolean.`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
