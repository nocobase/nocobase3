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
import { bodyLimit } from 'hono/body-limit';
import { getRequestTranslator } from '@nocobase/i18n/server';

import { mailServiceToken } from '../tokens.js';
import { MailIdempotencyConflictError } from '../operations/send-mail.js';
import type {
  MailAddress,
  MailBulkComposeInput,
  MailComposeInput,
  MailListMessagesInput,
  MailStartSyncInput,
} from '../types.js';

type MailRoutesEnv = {
  Variables: AuthEnv['Variables'] & AuthorizationEnv['Variables'];
};

const MAIL_NAMESPACE = '@nocobase/app-plugin-mail';
const MAX_ATTACHMENT_UPLOAD_BYTES = 27 * 1024 * 1024;

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
    routes.patch('/accounts/:accountId', async (context) => {
      const value = await readObject(context.req.raw);
      const status = value.status;
      if (
        status !== undefined &&
        status !== 'active' &&
        status !== 'suspended'
      ) {
        throw new TypeError('Mail field "status" must be active or suspended.');
      }
      return context.json({
        data: await mail.updateAccount(operationContext(context), {
          accountId: context.req.param('accountId'),
          status,
          isDefault: optionalBoolean(value.isDefault, 'isDefault'),
        }),
      });
    });
    routes.delete('/accounts/:accountId', async (context) => {
      await mail.removeAccount(
        operationContext(context),
        context.req.param('accountId'),
      );
      return context.body(null, 204);
    });
    routes.get('/settings/accounts', async (context) =>
      context.json({
        data: await mail.listManagedAccounts(operationContext(context)),
      }),
    );
    routes.get('/settings/operation-logs', async (context) =>
      context.json({
        data: await mail.listManagedOperationLogs(operationContext(context)),
      }),
    );
    routes.get('/unread-count', async (context) =>
      context.json({
        data: await mail.getUnreadCount(operationContext(context)),
      }),
    );
    routes.get('/providers', async (context) =>
      context.json({ data: await mail.listProviders() }),
    );
    routes.get('/templates', async (context) =>
      context.json({
        data: await mail.listTemplates(operationContext(context)),
      }),
    );
    routes.post('/templates', async (context) => {
      const value = await readObject(context.req.raw);
      return context.json({
        data: await mail.saveTemplate(operationContext(context), {
          name: requiredString(value.name, 'name'),
          subject: requiredString(value.subject, 'subject'),
          text: optionalString(value.text, 'text'),
          html: optionalString(value.html, 'html'),
        }),
      });
    });
    routes.patch('/templates/:templateId', async (context) => {
      const value = await readObject(context.req.raw);
      return context.json({
        data: await mail.saveTemplate(operationContext(context), {
          id: context.req.param('templateId'),
          name: requiredString(value.name, 'name'),
          subject: requiredString(value.subject, 'subject'),
          text: optionalString(value.text, 'text'),
          html: optionalString(value.html, 'html'),
        }),
      });
    });
    routes.delete('/templates/:templateId', async (context) => {
      await mail.deleteTemplate(
        operationContext(context),
        context.req.param('templateId'),
      );
      return context.body(null, 204);
    });
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
    routes.patch(
      '/accounts/:accountId/identities/:identityId',
      async (context) => {
        const value = await readObject(context.req.raw);
        return context.json({
          data: await mail.updateIdentity(operationContext(context), {
            accountId: context.req.param('accountId'),
            identityId: context.req.param('identityId'),
            displayName: optionalNullableString(
              value.displayName,
              'displayName',
            ),
            signatureText: optionalNullableString(
              value.signatureText,
              'signatureText',
            ),
            signatureHtml: optionalNullableString(
              value.signatureHtml,
              'signatureHtml',
            ),
          }),
        });
      },
    );
    routes.get(
      '/accounts/:accountId/identities/:identityId/signatures',
      async (context) =>
        context.json({
          data: await mail.listSignatures(
            operationContext(context),
            context.req.param('accountId'),
            context.req.param('identityId'),
          ),
        }),
    );
    routes.post(
      '/accounts/:accountId/identities/:identityId/signatures',
      async (context) => {
        const value = await readObject(context.req.raw);
        return context.json({
          data: await mail.saveSignature(operationContext(context), {
            accountId: context.req.param('accountId'),
            identityId: context.req.param('identityId'),
            name: requiredString(value.name, 'name'),
            text: optionalString(value.text, 'text') ?? '',
            html: optionalNullableString(value.html, 'html'),
            isDefault: optionalBoolean(value.isDefault, 'isDefault'),
          }),
        });
      },
    );
    routes.patch(
      '/accounts/:accountId/identities/:identityId/signatures/:signatureId',
      async (context) => {
        const value = await readObject(context.req.raw);
        return context.json({
          data: await mail.saveSignature(operationContext(context), {
            id: context.req.param('signatureId'),
            accountId: context.req.param('accountId'),
            identityId: context.req.param('identityId'),
            name: requiredString(value.name, 'name'),
            text: optionalString(value.text, 'text') ?? '',
            html: optionalNullableString(value.html, 'html'),
            isDefault: optionalBoolean(value.isDefault, 'isDefault'),
          }),
        });
      },
    );
    routes.delete(
      '/accounts/:accountId/identities/:identityId/signatures/:signatureId',
      async (context) => {
        await mail.deleteSignature(
          operationContext(context),
          context.req.param('accountId'),
          context.req.param('identityId'),
          context.req.param('signatureId'),
        );
        return context.body(null, 204);
      },
    );
    routes.get('/accounts/:accountId/folders', async (context) =>
      context.json({
        data: await mail.listFolders(
          operationContext(context),
          context.req.param('accountId'),
        ),
      }),
    );
    routes.post('/accounts/:accountId/labels', async (context) => {
      const value = await readObject(context.req.raw);
      return context.json({
        data: await mail.createLabel(
          operationContext(context),
          context.req.param('accountId'),
          requiredString(value.name, 'name'),
        ),
      });
    });
    routes.post(
      '/attachments',
      bodyLimit({
        maxSize: MAX_ATTACHMENT_UPLOAD_BYTES,
        onError: (context) =>
          context.json(
            {
              error: {
                code: 'INVALID_MAIL_REQUEST',
                message: getRequestTranslator(
                  context,
                  MAIL_NAMESPACE,
                )('errors.invalidRequest'),
              },
            },
            413,
          ),
      }),
      async (context) => {
        const form = await context.req.formData();
        const file = form.get('file');
        if (!(file instanceof File)) {
          throw new TypeError('Mail attachment file is required.');
        }
        return context.json({
          data: await mail.uploadAttachment(operationContext(context), {
            fileName: file.name,
            contentType: file.type || 'application/octet-stream',
            size: file.size,
            stream: file.stream(),
          }),
        });
      },
    );
    routes.post('/messages/send', async (context) => {
      const input = await readComposeInput(context.req.raw);
      return context.json(
        { data: await mail.sendMessage(operationContext(context), input) },
        200,
      );
    });
    routes.post('/messages/bulk', async (context) => {
      const input = await readBulkComposeInput(context.req.raw);
      return context.json(
        { data: await mail.sendBulk(operationContext(context), input) },
        200,
      );
    });
    routes.post('/messages/drafts', async (context) => {
      const input = await readDraftInput(context.req.raw);
      return context.json({
        data: await mail.saveDraft(operationContext(context), input),
      });
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
    routes.get('/sync-runs', async (context) =>
      context.json({
        data: await mail.listSyncRuns(operationContext(context)),
      }),
    );
    routes.get('/submissions', async (context) =>
      context.json({
        data: await mail.listSubmissions(operationContext(context)),
      }),
    );
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
    routes.post('/sync-runs/:syncRunId/retry', async (context) =>
      context.json(
        {
          data: await mail.retrySyncRun(
            operationContext(context),
            context.req.param('syncRunId'),
          ),
        },
        202,
      ),
    );
    routes.post('/sync-runs/:syncRunId/cancel', async (context) =>
      context.json({
        data: await mail.cancelSyncRun(
          operationContext(context),
          context.req.param('syncRunId'),
        ),
      }),
    );
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
    routes.get(
      '/accounts/:accountId/messages/:messageId/attachments/:attachmentId',
      async (context) => {
        const content = await mail.getAttachment(
          operationContext(context),
          context.req.param('accountId'),
          context.req.param('messageId'),
          context.req.param('attachmentId'),
        );
        const headers = new Headers({
          'content-type': safeContentType(content.contentType),
          'content-disposition': attachmentDisposition(content.fileName),
          'x-content-type-options': 'nosniff',
        });
        if (content.size !== undefined) {
          headers.set('content-length', String(content.size));
        }
        return new Response(content.stream, { headers });
      },
    );
    routes.patch(
      '/accounts/:accountId/messages/:messageId',
      async (context) => {
        const value = await readObject(context.req.raw);
        return context.json({
          data: await mail.updateMessage(operationContext(context), {
            accountId: context.req.param('accountId'),
            messageId: context.req.param('messageId'),
            read: optionalBoolean(value.read, 'read'),
            starred: optionalBoolean(value.starred, 'starred'),
            note: optionalNullableString(value.note, 'note'),
            todo: optionalBoolean(value.todo, 'todo'),
          }),
        });
      },
    );
    routes.patch(
      '/accounts/:accountId/messages/:messageId/labels',
      async (context) => {
        const value = await readObject(context.req.raw);
        return context.json({
          data: await mail.updateMessageLabels(operationContext(context), {
            accountId: context.req.param('accountId'),
            messageId: context.req.param('messageId'),
            addLabelIds: optionalStringArray(value.addLabelIds, 'addLabelIds'),
            removeLabelIds: optionalStringArray(
              value.removeLabelIds,
              'removeLabelIds',
            ),
          }),
        });
      },
    );
    routes.post(
      '/accounts/:accountId/messages/:messageId/move',
      async (context) => {
        const value = await readObject(context.req.raw);
        return context.json({
          data: await mail.moveMessage(operationContext(context), {
            accountId: context.req.param('accountId'),
            messageId: context.req.param('messageId'),
            providerFolderId: requiredString(
              value.providerFolderId,
              'providerFolderId',
            ),
          }),
        });
      },
    );
    routes.delete(
      '/accounts/:accountId/messages/:messageId',
      async (context) => {
        await mail.deleteMessage(operationContext(context), {
          accountId: context.req.param('accountId'),
          messageId: context.req.param('messageId'),
          permanently: optionalBoolean(
            context.req.query('permanently'),
            'permanently',
          ),
        });
        return context.body(null, 204);
      },
    );

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

async function readDraftInput(request: Request): Promise<MailComposeInput> {
  const value = await readObject(request);
  return {
    accountId: requiredString(value.accountId, 'accountId'),
    identityId: requiredString(value.identityId, 'identityId'),
    signatureId: optionalNullableString(value.signatureId, 'signatureId'),
    to: optionalAddresses(value.to, 'to') ?? [],
    cc: optionalAddresses(value.cc, 'cc'),
    bcc: optionalAddresses(value.bcc, 'bcc'),
    subject: optionalString(value.subject, 'subject') ?? '',
    text: optionalString(value.text, 'text') ?? '',
    html: optionalString(value.html, 'html'),
    attachmentIds: optionalStringArray(value.attachmentIds, 'attachmentIds'),
    retainedAttachmentIds: optionalStringArray(
      value.retainedAttachmentIds,
      'retainedAttachmentIds',
    ),
    inReplyToMessageId: optionalString(
      value.inReplyToMessageId,
      'inReplyToMessageId',
    ),
    forwardOfMessageId: optionalString(
      value.forwardOfMessageId,
      'forwardOfMessageId',
    ),
    draftMessageId: optionalString(value.draftMessageId, 'draftMessageId'),
    idempotencyKey: requiredString(value.idempotencyKey, 'idempotencyKey'),
  };
}

function attachmentDisposition(fileName: string): string {
  const fallback =
    Array.from(fileName, (character) => {
      const code = character.codePointAt(0) ?? 0;
      return code >= 0x20 &&
        code <= 0x7e &&
        character !== '"' &&
        character !== '\\'
        ? character
        : '_';
    }).join('') || 'attachment';
  const encoded = encodeURIComponent(fileName).replace(
    /['()*]/gu,
    (character) => `%${character.codePointAt(0)?.toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

function safeContentType(value: string): string {
  return /^[\w!#$&^_.+-]+\/[\w!#$&^_.+-]+(?:\s*;[^\r\n]*)?$/u.test(value)
    ? value
    : 'application/octet-stream';
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
    signatureId: optionalNullableString(value.signatureId, 'signatureId'),
    to: addresses(value.to, 'to'),
    cc: optionalAddresses(value.cc, 'cc'),
    bcc: optionalAddresses(value.bcc, 'bcc'),
    subject,
    text,
    html: optionalString(value.html, 'html'),
    attachmentIds: optionalStringArray(value.attachmentIds, 'attachmentIds'),
    retainedAttachmentIds: optionalStringArray(
      value.retainedAttachmentIds,
      'retainedAttachmentIds',
    ),
    inReplyToMessageId: optionalString(
      value.inReplyToMessageId,
      'inReplyToMessageId',
    ),
    forwardOfMessageId: optionalString(
      value.forwardOfMessageId,
      'forwardOfMessageId',
    ),
    scheduledAt: optionalString(value.scheduledAt, 'scheduledAt'),
    draftMessageId: optionalString(value.draftMessageId, 'draftMessageId'),
    idempotencyKey,
  };
}

async function readBulkComposeInput(
  request: Request,
): Promise<MailBulkComposeInput> {
  const value = await readObject(request);
  return {
    accountId: requiredString(value.accountId, 'accountId'),
    identityId: requiredString(value.identityId, 'identityId'),
    signatureId: optionalNullableString(value.signatureId, 'signatureId'),
    recipients: addresses(value.recipients, 'recipients'),
    subject: requiredString(value.subject, 'subject'),
    text: requiredString(value.text, 'text'),
    html: optionalString(value.html, 'html'),
    attachmentIds: optionalStringArray(value.attachmentIds, 'attachmentIds'),
    retainedAttachmentIds: optionalStringArray(
      value.retainedAttachmentIds,
      'retainedAttachmentIds',
    ),
    scheduledAt: optionalString(value.scheduledAt, 'scheduledAt'),
    idempotencyKey: requiredString(value.idempotencyKey, 'idempotencyKey'),
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

function optionalNullableString(
  value: unknown,
  field: string,
): string | null | undefined {
  if (value === null) return null;
  return optionalString(value, field);
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
