import { validateLogPagination } from '../log-pagination.js';
import {
  authenticationToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication';
import {
  authorizationToken,
  type AuthorizationEnv,
} from '@nocobase/app-plugin-authorization';
import type { AppIdentityConfig } from '@nocobase/app-server/config';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { Hono, type MiddlewareHandler } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { getRequestTranslator } from '@nocobase/i18n/server';

import {
  type MailConfig,
  resolveMailOAuthCallbackUrl,
  resolveMailOAuthOrigin,
} from '../config.js';
import { mailServiceToken } from '../tokens.js';
import { MailIdempotencyConflictError } from '../operations/send-mail.js';
import { isMailLabelColor } from '../../shared/mail.js';
import type {
  MailAddress,
  MailBulkComposeInput,
  MailComposeInput,
  MailListMessagesInput,
  MailLabelColor,
  MailManagementMessageActionInput,
  MailDraftConflictAction,
  MailStartSyncInput,
} from '../../shared/mail.js';

type MailRoutesEnv = {
  Variables: AuthEnv['Variables'] & AuthorizationEnv['Variables'];
};

const MAIL_NAMESPACE = '@nocobase/app-plugin-mail';
const MAX_ATTACHMENT_UPLOAD_BYTES = 27 * 1024 * 1024;
const MAX_JSON_REQUEST_BYTES = 8 * 1024 * 1024;
const MAX_MAIL_BODY_LENGTH = 4 * 1024 * 1024;
const MAX_MAIL_STRING_LENGTH = 4000;
const MAX_MAIL_SUBJECT_LENGTH = 2000;
const MAX_MAIL_IDEMPOTENCY_KEY_LENGTH = 255;
const MAX_MAIL_ADDRESS_LENGTH = 320;
const MAX_MAIL_NAME_LENGTH = 255;
const MAX_MAIL_ARRAY_ITEMS = 100;
const MAX_MAIL_ATTACHMENT_IDS = 100;
const MAIL_WORKSPACE_RESOURCE = 'mail.workspace';
const MAIL_ADMIN_RESOURCE = 'mail.admin';
const MAIL_MANAGEMENT_RESOURCE = 'mail.management';

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
        const resource = /(?:^|\/)mail\/settings(?:\/|$)/u.test(
          context.req.path,
        )
          ? MAIL_ADMIN_RESOURCE
          : /(?:^|\/)mail\/management(?:\/|$)/u.test(context.req.path)
            ? MAIL_MANAGEMENT_RESOURCE
            : MAIL_WORKSPACE_RESOURCE;
        const allowed = await context.get('authz').can({
          resource: { type: 'page', id: resource },
          action: 'access',
        });
        if (!allowed) {
          const t = getRequestTranslator(context, MAIL_NAMESPACE);
          return context.json(
            {
              error: {
                code: 'MAIL_ACCESS_DENIED',
                ns: '@nocobase/app-plugin-mail',
                key: 'errors.accessDenied',
                params: {},
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
              ns: '@nocobase/app-plugin-mail',
              key: 'errors.idempotencyConflict',
              params: {},
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
            ns: MAIL_NAMESPACE,
            key: invalid ? 'errors.invalidRequest' : 'errors.requestFailed',
            params: {},
            message: t(
              invalid ? 'errors.invalidRequest' : 'errors.requestFailed',
            ),
          },
        },
        invalid ? 400 : 422,
      );
    });

    const jsonBodyLimit = bodyLimit({
      maxSize: MAX_JSON_REQUEST_BYTES,
      onError: (context) =>
        context.json(
          {
            error: {
              code: 'INVALID_MAIL_REQUEST',
              ns: '@nocobase/app-plugin-mail',
              key: 'errors.invalidRequest',
              params: {},
              message: getRequestTranslator(
                context,
                MAIL_NAMESPACE,
              )('errors.invalidRequest'),
            },
          },
          413,
        ),
    }) as MiddlewareHandler<MailRoutesEnv>;
    routes.use('*', async (context, next) => {
      if (
        (context.req.method === 'POST' || context.req.method === 'PATCH') &&
        !context.req.path.endsWith('/attachments')
      ) {
        return jsonBodyLimit(
          context as Parameters<typeof jsonBodyLimit>[0],
          next,
        );
      }
      return next();
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
    routes.get('/management/accounts', async (context) =>
      context.json({
        data: await mail.listManagedAccounts(operationContext(context)),
      }),
    );
    routes.get('/management/accounts/:accountId/folders', async (context) =>
      context.json({
        data: await mail.listManagedFolders(
          operationContext(context),
          context.req.param('accountId'),
        ),
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
          name: requiredString(value.name, 'name', MAX_MAIL_NAME_LENGTH),
          subject: requiredString(
            value.subject,
            'subject',
            MAX_MAIL_SUBJECT_LENGTH,
          ),
          text: optionalString(value.text, 'text', MAX_MAIL_BODY_LENGTH),
          html: optionalString(value.html, 'html', MAX_MAIL_BODY_LENGTH),
        }),
      });
    });
    routes.patch('/templates/:templateId', async (context) => {
      const value = await readObject(context.req.raw);
      return context.json({
        data: await mail.saveTemplate(operationContext(context), {
          id: context.req.param('templateId'),
          name: requiredString(value.name, 'name', MAX_MAIL_NAME_LENGTH),
          subject: requiredString(
            value.subject,
            'subject',
            MAX_MAIL_SUBJECT_LENGTH,
          ),
          text: optionalString(value.text, 'text', MAX_MAIL_BODY_LENGTH),
          html: optionalString(value.html, 'html', MAX_MAIL_BODY_LENGTH),
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
      const identity = config.get<AppIdentityConfig>('app')!;
      const requestOrigin = new URL(context.req.url).origin;
      const origin = resolveMailOAuthOrigin(
        identity.publicOrigin,
        requestOrigin,
      );
      const configuredMail = config.get<MailConfig>('mail')!;
      return context.json({
        data: await mail.startAuthorization(operationContext(context), {
          provider: {
            type: requiredString(value.type, 'type'),
            name: requiredString(value.name, 'name', MAX_MAIL_NAME_LENGTH),
          },
          redirectUri: resolveMailOAuthCallbackUrl(
            configuredMail.oauthCallbackUrl,
            origin,
            publicBasePath,
          ).toString(),
          ...(value.scopes !== undefined
            ? { scopes: optionalStringArray(value.scopes, 'scopes') }
            : {}),
          ...(value.initialSyncReceivedAfter !== undefined
            ? {
                initialSyncReceivedAfter: optionalNullableString(
                  value.initialSyncReceivedAfter,
                  'initialSyncReceivedAfter',
                ),
              }
            : {}),
        }),
      });
    });
    routes.post('/accounts/connect', async (context) => {
      const value = await readObject(context.req.raw);
      const address = requiredString(
        value.address,
        'address',
        MAX_MAIL_ADDRESS_LENGTH,
      );
      return context.json({
        data: await mail.connectAccount(operationContext(context), {
          provider: {
            type: requiredString(value.type, 'type'),
            name: requiredString(value.name, 'name', MAX_MAIL_NAME_LENGTH),
          },
          address,
          ...(value.displayName !== undefined
            ? {
                displayName: optionalString(
                  value.displayName,
                  'displayName',
                  MAX_MAIL_NAME_LENGTH,
                ),
              }
            : {}),
          username: optionalString(value.username, 'username') ?? address,
          password: requiredString(value.password, 'password'),
          ...(value.initialSyncReceivedAfter !== undefined
            ? {
                initialSyncReceivedAfter: optionalNullableString(
                  value.initialSyncReceivedAfter,
                  'initialSyncReceivedAfter',
                ),
              }
            : {}),
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
          }),
        });
      },
    );
    routes.get('/accounts/:accountId/signatures', async (context) =>
      context.json({
        data: await mail.listSignatures(
          operationContext(context),
          context.req.param('accountId'),
        ),
      }),
    );
    routes.post('/accounts/:accountId/signatures', async (context) => {
      const value = await readObject(context.req.raw);
      return context.json({
        data: await mail.saveSignature(operationContext(context), {
          accountId: context.req.param('accountId'),
          name: requiredString(value.name, 'name', MAX_MAIL_NAME_LENGTH),
          text: optionalString(value.text, 'text', MAX_MAIL_BODY_LENGTH) ?? '',
          html: optionalNullableString(
            value.html,
            'html',
            MAX_MAIL_BODY_LENGTH,
          ),
          isDefault: optionalBoolean(value.isDefault, 'isDefault'),
        }),
      });
    });
    routes.patch(
      '/accounts/:accountId/signatures/:signatureId',
      async (context) => {
        const value = await readObject(context.req.raw);
        return context.json({
          data: await mail.saveSignature(operationContext(context), {
            id: context.req.param('signatureId'),
            accountId: context.req.param('accountId'),
            name: requiredString(value.name, 'name', MAX_MAIL_NAME_LENGTH),
            text:
              optionalString(value.text, 'text', MAX_MAIL_BODY_LENGTH) ?? '',
            html: optionalNullableString(
              value.html,
              'html',
              MAX_MAIL_BODY_LENGTH,
            ),
            isDefault: optionalBoolean(value.isDefault, 'isDefault'),
          }),
        });
      },
    );
    routes.delete(
      '/accounts/:accountId/signatures/:signatureId',
      async (context) => {
        await mail.deleteSignature(
          operationContext(context),
          context.req.param('accountId'),
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
    routes.get('/labels', async (context) =>
      context.json({
        data: await mail.listLabels(operationContext(context)),
      }),
    );
    routes.post('/labels', async (context) => {
      const value = await readObject(context.req.raw);
      return context.json({
        data: await mail.createLabel(operationContext(context), {
          name: requiredString(value.name, 'name', MAX_MAIL_NAME_LENGTH),
          color: optionalLabelColor(value.color, 'color'),
        }),
      });
    });
    routes.patch('/labels/:labelId', async (context) => {
      const value = await readObject(context.req.raw);
      return context.json({
        data: await mail.updateLabel(operationContext(context), {
          id: context.req.param('labelId'),
          name: requiredString(value.name, 'name', MAX_MAIL_NAME_LENGTH),
          color: optionalLabelColor(value.color, 'color'),
        }),
      });
    });
    routes.delete('/labels/:labelId', async (context) => {
      await mail.deleteLabel(
        operationContext(context),
        context.req.param('labelId'),
      );
      return context.body(null, 204);
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
                ns: '@nocobase/app-plugin-mail',
                key: 'errors.invalidRequest',
                params: {},
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
    routes.post(
      '/accounts/:accountId/messages/:messageId/draft-conflict',
      async (context) => {
        const value = await readObject(context.req.raw);
        return context.json({
          data: await mail.resolveDraftConflict(operationContext(context), {
            accountId: context.req.param('accountId'),
            messageId: context.req.param('messageId'),
            action: requiredDraftConflictAction(value.action),
          }),
        });
      },
    );
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
    routes.get('/sync-runs', async (context) => {
      const offset = optionalInteger(context.req.query('offset'), 'offset');
      const limit = optionalInteger(context.req.query('limit'), 'limit');
      validateLogPagination(offset ?? 0, limit ?? 100);
      if (optionalBoolean(context.req.query('withTotal'), 'withTotal')) {
        return context.json({
          data: await mail.listSyncRunsPage(
            operationContext(context),
            offset,
            limit,
          ),
        });
      }
      return context.json({
        data: await mail.listSyncRuns(operationContext(context), offset, limit),
      });
    });
    routes.post('/submissions/:submissionId/retry', async (context) =>
      context.json({
        data: await mail.retrySubmission(
          operationContext(context),
          context.req.param('submissionId'),
        ),
      }),
    );
    routes.post('/submissions/:submissionId/cancel', async (context) =>
      context.json({
        data: await mail.cancelSubmission(
          operationContext(context),
          context.req.param('submissionId'),
        ),
      }),
    );
    routes.get('/submissions', async (context) => {
      const offset = optionalInteger(context.req.query('offset'), 'offset');
      const limit = optionalInteger(context.req.query('limit'), 'limit');
      validateLogPagination(offset ?? 0, limit ?? 100);
      if (optionalBoolean(context.req.query('withTotal'), 'withTotal')) {
        return context.json({
          data: await mail.listSubmissionsPage(
            operationContext(context),
            context.req.query('bulkOnly') === 'true',
            offset,
            context.req.query('groupByBatch') === 'true',
            limit,
          ),
        });
      }
      return context.json({
        data: await mail.listSubmissions(
          operationContext(context),
          context.req.query('bulkOnly') === 'true' ? true : undefined,
          offset,
          context.req.query('groupByBatch') === 'true' ? true : undefined,
          limit,
        ),
      });
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
                ns: '@nocobase/app-plugin-mail',
                key: 'errors.syncRunNotFound',
                params: {},
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
      const labelId = context.req.query('labelId');
      const input: MailListMessagesInput = {
        accountIds: accountId ? [accountId] : undefined,
        folderIds: folderId ? [folderId] : undefined,
        labelIds: labelId ? [labelId] : undefined,
        conversationId: context.req.query('conversationId'),
        query: context.req.query('query'),
        cursor: context.req.query('cursor'),
        offset: optionalInteger(context.req.query('offset'), 'offset'),
        withTotal: optionalBoolean(context.req.query('withTotal'), 'withTotal'),
        limit: optionalInteger(context.req.query('limit'), 'limit'),
        unread: optionalBoolean(context.req.query('unread'), 'unread'),
        starred: optionalBoolean(context.req.query('starred'), 'starred'),
      };
      return context.json({
        data: await mail.listMessages(operationContext(context), input),
      });
    });
    routes.get('/management/messages', async (context) => {
      const accountId = context.req.query('accountId');
      const input: MailListMessagesInput = {
        accountIds: accountId ? [accountId] : undefined,
        folderIds: context.req.query('folderId')
          ? [context.req.query('folderId')!]
          : undefined,
        query: context.req.query('query'),
        cursor: context.req.query('cursor'),
        offset: optionalInteger(context.req.query('offset'), 'offset'),
        withTotal: optionalBoolean(context.req.query('withTotal'), 'withTotal'),
        limit: optionalInteger(context.req.query('limit'), 'limit'),
        unread: optionalBoolean(context.req.query('unread'), 'unread'),
        starred: optionalBoolean(context.req.query('starred'), 'starred'),
      };
      return context.json({
        data: await mail.listManagedMessages(operationContext(context), input),
      });
    });
    routes.post('/management/messages/actions', async (context) =>
      context.json({
        data: await mail.manageMessages(
          operationContext(context),
          await readManagementMessageActionInput(context.req.raw),
        ),
      }),
    );
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
    routes.get(
      '/management/accounts/:accountId/messages/:messageId',
      async (context) => {
        const t = getRequestTranslator(context, MAIL_NAMESPACE);
        const message = await mail.getManagedMessage(
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
                  ns: '@nocobase/app-plugin-mail',
                  key: 'errors.messageNotFound',
                  params: {},
                  message: t('errors.messageNotFound'),
                },
              },
              404,
            );
      },
    );
    routes.get(
      '/management/accounts/:accountId/messages/:messageId/attachments/:attachmentId',
      async (context) => {
        const content = await mail.getManagedAttachment(
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
    routes.post(
      '/accounts/:accountId/messages/:messageId/content/retry',
      async (context) => {
        const message = await mail.retryMessageContent(
          operationContext(context),
          context.req.param('accountId'),
          context.req.param('messageId'),
        );
        return context.json({ data: message });
      },
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
                ns: '@nocobase/app-plugin-mail',
                key: 'errors.messageNotFound',
                params: {},
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
  req: { raw: Request };
}): { actorId: string; signal: AbortSignal } {
  return {
    actorId: context.get('auth').user.id,
    signal: context.req.raw.signal,
  };
}

function requiredDraftConflictAction(value: unknown): MailDraftConflictAction {
  if (value === 'useRemote' || value === 'keepLocal') return value;
  throw new TypeError('draft conflict action is invalid.');
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
    subject:
      optionalString(value.subject, 'subject', MAX_MAIL_SUBJECT_LENGTH) ?? '',
    text: optionalString(value.text, 'text', MAX_MAIL_BODY_LENGTH) ?? '',
    html: optionalString(value.html, 'html', MAX_MAIL_BODY_LENGTH),
    attachmentIds: optionalStringArray(
      value.attachmentIds,
      'attachmentIds',
      MAX_MAIL_ATTACHMENT_IDS,
    ),
    retainedAttachmentIds: optionalStringArray(
      value.retainedAttachmentIds,
      'retainedAttachmentIds',
      MAX_MAIL_ATTACHMENT_IDS,
    ),
    inReplyToMessageId: optionalString(
      value.inReplyToMessageId,
      'inReplyToMessageId',
    ),
    forwardOfMessageId: optionalString(
      value.forwardOfMessageId,
      'forwardOfMessageId',
    ),
    forwardBodyIncluded: optionalBoolean(
      value.forwardBodyIncluded,
      'forwardBodyIncluded',
    ),
    draftMessageId: optionalString(value.draftMessageId, 'draftMessageId'),
    idempotencyKey: requiredString(
      value.idempotencyKey,
      'idempotencyKey',
      MAX_MAIL_IDEMPOTENCY_KEY_LENGTH,
    ),
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
  const subject = requiredString(
    value.subject,
    'subject',
    MAX_MAIL_SUBJECT_LENGTH,
  );
  const text = requiredString(value.text, 'text', MAX_MAIL_BODY_LENGTH);
  const idempotencyKey = requiredString(
    value.idempotencyKey,
    'idempotencyKey',
    MAX_MAIL_IDEMPOTENCY_KEY_LENGTH,
  );
  return {
    accountId,
    identityId,
    signatureId: optionalNullableString(value.signatureId, 'signatureId'),
    to: addresses(value.to, 'to'),
    cc: optionalAddresses(value.cc, 'cc'),
    bcc: optionalAddresses(value.bcc, 'bcc'),
    subject,
    text,
    html: optionalString(value.html, 'html', MAX_MAIL_BODY_LENGTH),
    attachmentIds: optionalStringArray(
      value.attachmentIds,
      'attachmentIds',
      MAX_MAIL_ATTACHMENT_IDS,
    ),
    retainedAttachmentIds: optionalStringArray(
      value.retainedAttachmentIds,
      'retainedAttachmentIds',
      MAX_MAIL_ATTACHMENT_IDS,
    ),
    inReplyToMessageId: optionalString(
      value.inReplyToMessageId,
      'inReplyToMessageId',
    ),
    forwardOfMessageId: optionalString(
      value.forwardOfMessageId,
      'forwardOfMessageId',
    ),
    forwardBodyIncluded: optionalBoolean(
      value.forwardBodyIncluded,
      'forwardBodyIncluded',
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
    subject: requiredString(value.subject, 'subject', MAX_MAIL_SUBJECT_LENGTH),
    text: requiredString(value.text, 'text', MAX_MAIL_BODY_LENGTH),
    html: optionalString(value.html, 'html', MAX_MAIL_BODY_LENGTH),
    attachmentIds: optionalStringArray(
      value.attachmentIds,
      'attachmentIds',
      MAX_MAIL_ATTACHMENT_IDS,
    ),
    retainedAttachmentIds: optionalStringArray(
      value.retainedAttachmentIds,
      'retainedAttachmentIds',
      MAX_MAIL_ATTACHMENT_IDS,
    ),
    scheduledAt: optionalString(value.scheduledAt, 'scheduledAt'),
    idempotencyKey: requiredString(
      value.idempotencyKey,
      'idempotencyKey',
      MAX_MAIL_IDEMPOTENCY_KEY_LENGTH,
    ),
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
    ...(value.receivedAfter !== undefined
      ? {
          receivedAfter: optionalString(value.receivedAfter, 'receivedAfter'),
        }
      : {}),
    ...(value.maxMessages !== undefined
      ? { maxMessages: optionalInteger(value.maxMessages, 'maxMessages') }
      : {}),
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

async function readManagementMessageActionInput(
  request: Request,
): Promise<MailManagementMessageActionInput> {
  const value = await readObject(request);
  const action = value.action;
  if (
    action !== 'markRead' &&
    action !== 'markUnread' &&
    action !== 'star' &&
    action !== 'unstar' &&
    action !== 'archive' &&
    action !== 'move' &&
    action !== 'delete'
  ) {
    throw new TypeError('Mail management action is invalid.');
  }
  if (!Array.isArray(value.items) || value.items.length === 0) {
    throw new TypeError('Mail management action requires at least one item.');
  }
  if (value.items.length > MAX_MAIL_ARRAY_ITEMS) {
    throw new TypeError(
      `Mail management action accepts at most ${MAX_MAIL_ARRAY_ITEMS} items.`,
    );
  }
  return {
    action,
    items: value.items.map((item, index) => {
      if (!isRecord(item)) {
        throw new TypeError(`Mail management item ${index} must be an object.`);
      }
      return {
        accountId: requiredString(item.accountId, `items[${index}].accountId`),
        messageId: requiredString(item.messageId, `items[${index}].messageId`),
      };
    }),
    providerFolderId: optionalString(
      value.providerFolderId,
      'providerFolderId',
    ),
    permanently: optionalBoolean(value.permanently, 'permanently'),
  };
}

function addresses(value: unknown, field: string): readonly MailAddress[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new TypeError(
      `Mail field "${field}" must contain at least one address.`,
    );
  }
  if (value.length > MAX_MAIL_ARRAY_ITEMS) {
    throw new TypeError(
      `Mail field "${field}" must contain at most ${MAX_MAIL_ARRAY_ITEMS} addresses.`,
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
  if (value.length > MAX_MAIL_ARRAY_ITEMS) {
    throw new TypeError(
      `Mail field "${field}" must contain at most ${MAX_MAIL_ARRAY_ITEMS} addresses.`,
    );
  }
  return value.map((item) => address(item, field));
}

function address(value: unknown, field: string): MailAddress {
  if (!isRecord(value))
    throw new TypeError(`Mail field "${field}" contains an invalid address.`);
  return {
    address: requiredString(
      value.address,
      `${field}.address`,
      MAX_MAIL_ADDRESS_LENGTH,
    ),
    name: optionalString(value.name, `${field}.name`, MAX_MAIL_NAME_LENGTH),
  };
}

function requiredString(
  value: unknown,
  field: string,
  maxLength = MAX_MAIL_STRING_LENGTH,
): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`Mail field "${field}" must be a non-empty string.`);
  }
  if (value.length > maxLength) {
    throw new TypeError(
      `Mail field "${field}" must be at most ${maxLength} characters.`,
    );
  }
  return value;
}

function optionalString(
  value: unknown,
  field: string,
  maxLength = MAX_MAIL_STRING_LENGTH,
): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string')
    throw new TypeError(`Mail field "${field}" must be a string.`);
  if (value.length > maxLength) {
    throw new TypeError(
      `Mail field "${field}" must be at most ${maxLength} characters.`,
    );
  }
  return value;
}

function optionalLabelColor(
  value: unknown,
  field: string,
): MailLabelColor | undefined {
  if (value === undefined) return undefined;
  if (!isMailLabelColor(value)) {
    throw new TypeError(`Mail field "${field}" contains an invalid color.`);
  }
  return value;
}

function optionalNullableString(
  value: unknown,
  field: string,
  maxLength = MAX_MAIL_STRING_LENGTH,
): string | null | undefined {
  if (value === null) return null;
  return optionalString(value, field, maxLength);
}

function optionalStringArray(
  value: unknown,
  field: string,
  maxItems = MAX_MAIL_ARRAY_ITEMS,
): readonly string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    throw new TypeError(`Mail field "${field}" must be an array.`);
  }
  if (value.length > maxItems) {
    throw new TypeError(
      `Mail field "${field}" must contain at most ${maxItems} items.`,
    );
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
