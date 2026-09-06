import {
  databaseManagerToken,
  type RepositoryFilter,
  type RepositoryRecord,
} from '@nocobase/db';
import { authenticationToken } from '@nocobase/app-plugin-authentication';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import { Hono } from 'hono';
import {
  AGGREGATE_PATH,
  type AggregateResponse,
  type AggregateScalar,
} from '../../shared/aggregate.js';

function scalar(value: unknown): AggregateScalar {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' || typeof value === 'string') return value;
  if (typeof value === 'bigint') return value.toString();
  throw new TypeError('Expected an aggregate scalar');
}
function text(value: unknown): string {
  if (typeof value === 'string') return value;
  throw new TypeError('Expected a string field');
}
// Only fixed example collections/fields are exposed. The caller can select a
// status and a HAVING threshold, never an arbitrary collection or expression.
export const aggregateRoutes: AppApiRouteContribution<AppPluginApplication> =
  defineApiRoutes((app) => {
    const router = new Hono();
    router.use(
      `/${AGGREGATE_PATH}`,
      app.container.resolve(authenticationToken).required(),
    );
    router.get(`/${AGGREGATE_PATH}`, async (context) => {
      const status = context.req.query('status') ?? 'all';
      const rawMinimum = context.req.query('minimumQuantity') ?? '0';
      const minimum = Number(rawMinimum);
      if (
        !['all', 'draft', 'confirmed', 'paid', 'cancelled'].includes(status) ||
        !/^\d+$/.test(rawMinimum) ||
        !Number.isSafeInteger(minimum) ||
        minimum > 1000000
      ) {
        return context.json(
          {
            code: 'INVALID_INPUT',
            message:
              'Use a valid order status and an integer minimumQuantity between 0 and 1000000.',
          },
          400,
        );
      }
      const db = app.container.resolve(databaseManagerToken);
      const orders = db.repository('repositoryExampleOrders');
      const items = db.repository('repositoryExampleOrderItems');
      const itemFilter: RepositoryFilter<RepositoryRecord> | undefined =
        status === 'all'
          ? undefined
          : (filter) => filter.string('order.status').eq(status);
      const summary = await items.aggregate({
        filter: itemFilter,
        aggregate: (a) => ({
          count: a.count(),
          quantity: a.sum('quantity'),
          averagePrice: a.avg('unitPriceCents'),
          minimumPrice: a.min('unitPriceCents'),
          maximumPrice: a.max('unitPriceCents'),
        }),
      });
      // Enum fields do not currently support groupBy. Count each known status
      // with aggregate; productId below demonstrates groupBy on a string field.
      const statuses = [];
      for (const value of ['cancelled', 'confirmed', 'draft', 'paid']) {
        if (status !== 'all' && status !== value) continue;
        const result = await orders.aggregate({
          filter: { status: value },
          aggregate: (a) => ({ count: a.count() }),
        });
        if (Number(result.count) > 0)
          statuses.push({ status: value, count: result.count });
      }
      const productGroups = await items.groupBy({
        by: ['productId'],
        filter: itemFilter,
        aggregate: (a) => ({
          count: a.count(),
          quantity: a.sum('quantity'),
          averagePrice: a.avg('unitPriceCents'),
        }),
        having: (f) => f.number('quantity').gte(minimum),
        sort: (s) => [s.field('quantity').desc(), s.field('productId').asc()],
      });
      const products = productGroups.length
        ? await db.repository('repositoryExampleProducts').findMany({
            filter: (f) =>
              f.or(
                productGroups.map((row) =>
                  f.string('id').eq(text(row.productId)),
                ),
              ),
            select: (s) => s.fields('id', 'name', 'sku'),
          })
        : [];
      const productNames = new Map(
        products.map((product) => [text(product.id), product]),
      );
      const customerRows = await db
        .repository('repositoryExampleCustomers')
        .findMany({
          limit: 50,
          sort: (s) => s.field('id').asc(),
          select: (s) =>
            s
              .fields('id', 'name')
              .include('orders', (r) =>
                status === 'all' ? r.count() : r.filter({ status }).count(),
              ),
        });
      const data: AggregateResponse = {
        summary: {
          count: scalar(summary.count),
          quantity: scalar(summary.quantity),
          averagePrice: scalar(summary.averagePrice),
          minimumPrice: scalar(summary.minimumPrice),
          maximumPrice: scalar(summary.maximumPrice),
        },
        statuses: statuses.map((row) => ({
          status: text(row.status),
          count: scalar(row.count),
        })),
        products: productGroups.map((row) => {
          const product = productNames.get(text(row.productId));
          return {
            productId: text(row.productId),
            name: product ? text(product.name) : text(row.productId),
            sku: product ? text(product.sku) : '',
            count: scalar(row.count),
            quantity: scalar(row.quantity),
            averagePrice: scalar(row.averagePrice),
          };
        }),
        customers: customerRows.map((row) => ({
          id: text(row.id),
          name: text(row.name),
          orders: Number(row.orders),
        })),
        customerLimit: 50,
      };
      return context.json({ data });
    });
    return router;
  });
