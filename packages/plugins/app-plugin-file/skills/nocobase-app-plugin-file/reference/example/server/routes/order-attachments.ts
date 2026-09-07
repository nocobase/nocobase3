import { authenticationToken } from '@nocobase/app-plugin-authentication';
import {
  authorizationToken,
  type AuthorizationEnv,
  type DatabaseAuthorizationConditions,
  type DatabaseFieldFilter,
  type DatabaseFilter,
  type DatabaseFilterOperator,
} from '@nocobase/app-plugin-authorization';
import {
  createFileRoute,
  type FileRouteAction,
} from '@nocobase/app-plugin-file/server';
import type { Application } from '@nocobase/app-server/application';
import { appConfig } from '@nocobase/app-server/config';
import { driveConfig, driveManagerToken } from '@nocobase/app-server/drive';
import { sessionManagerToken } from '@nocobase/app-server/session';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import {
  databaseManagerToken,
  type ComparisonOperator,
  type Expression,
  type ExpressionBuilder,
  type SqlBool,
} from '@nocobase/db';
import { Hono } from 'hono';
import { every } from 'hono/combine';
import { HTTPException } from 'hono/http-exception';

const parentActions: Readonly<Record<FileRouteAction, 'read' | 'update'>> = {
  list: 'read',
  read: 'read',
  'issue-token': 'read',
  upload: 'update',
  delete: 'update',
};

export const orderAttachmentRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const database = app.container.resolve(databaseManagerToken);
    const authorization = app.container.resolve(authorizationToken);
    // For an existing collection, extend its owning registration instead.
    // Registration describes capabilities; it does not grant them to users.
    authorization.database.collections.add({
      name: 'purchaseOrders',
      actions: ['read', 'create', 'update', 'delete'],
      fields: ['id', 'number', 'ownerId', 'attachments'],
      attributes: { identifier: 'id', owner: 'ownerId' },
    });
    const router = new Hono();
    router.route(
      '/purchase-orders/:orderId/attachments',
      createFileRoute({
        database,
        table: 'purchaseOrderAttachments',
        scope: (context) => ({
          orderId: parseOrderId(context.req.param('orderId')),
        }),
        drive: app.container.resolve(driveManagerToken),
        defaultDisk: app.config.get(driveConfig).default,
        publicBasePath: app.config.get(appConfig).publicBasePath,
        tokenSecret: app.container.resolve(sessionManagerToken).config.secret,
        audience: 'purchase-order-attachments',
        auth: every(
          app.container.resolve(authenticationToken).required(),
          authorization.middleware(),
        ),
        authorize: async (context, fileAction) => {
          const { authz }: Partial<AuthorizationEnv['Variables']> = context.var;
          if (!authz) return false;
          const action = parentActions[fileAction];
          const decision = await authz.authorize({
            resource: {
              type: 'database.collection',
              id: 'main.purchaseOrders',
            },
            action,
            params: {
              fields:
                action === 'read'
                  ? { output: ['attachments'] }
                  : { input: ['attachments'] },
            },
          });
          if (
            decision.effect !== 'conditional' ||
            decision.conditions?.type !== 'database'
          ) {
            return false;
          }
          const conditions =
            decision.conditions as DatabaseAuthorizationConditions;
          return database
            .query()
            .selectFrom('purchaseOrders')
            .where('id', '=', parseOrderId(context.req.param('orderId')))
            .where((eb) => compileFilter(eb, conditions.filter))
            .exists();
        },
        limits: {
          maxFiles: 10,
          maxSize: 50 * 1024 * 1024,
          mimeTypes: ['application/pdf'],
        },
      }),
    );
    return router;
  });

function parseOrderId(value: string | undefined): string {
  if (!value || !/^[A-Za-z0-9_-]{1,64}$/u.test(value)) {
    throw new HTTPException(400, { message: 'A valid orderId is required.' });
  }
  return value;
}

type FilterOperators = Readonly<
  Record<DatabaseFilterOperator, ComparisonOperator>
>;
const operators: FilterOperators = {
  $eq: '=',
  $ne: '!=',
  $in: 'in',
  $notIn: 'not in',
  $gt: '>',
  $gte: '>=',
  $lt: '<',
  $lte: '<=',
};

// Translate the existing Authorization Filter AST, not a browser-supplied filter.
// Reuse the App's adapter instead when it already provides one.
function compileFilter(
  eb: ExpressionBuilder,
  filter: DatabaseFilter,
): Expression<SqlBool> {
  return eb.and(
    Object.entries(filter).map(([field, value]) => {
      if (field === '$and' || field === '$or') {
        if (!Array.isArray(value)) {
          throw new TypeError('Invalid authorization filter.');
        }
        const nested = (value as readonly DatabaseFilter[]).map((item) =>
          compileFilter(eb, item),
        );
        return field === '$and' ? eb.and(nested) : eb.or(nested);
      }
      return eb.and(
        Object.entries(value as DatabaseFieldFilter).map(
          ([operator, expected]) => {
            const comparison = operators[operator as DatabaseFilterOperator];
            if (!comparison) {
              throw new TypeError('Unsupported authorization filter operator.');
            }
            return eb(
              field,
              expected === null && operator === '$eq'
                ? 'is'
                : expected === null && operator === '$ne'
                  ? 'is not'
                  : comparison,
              expected,
            );
          },
        ),
      );
    }),
  );
}
