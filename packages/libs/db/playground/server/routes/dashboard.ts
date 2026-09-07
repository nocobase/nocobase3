import { Hono } from 'hono';
import type { DatabaseConnection } from '@nocobase/db';

export function createDashboardRoutes(
  main: DatabaseConnection,
  crm: DatabaseConnection,
): Hono {
  const routes = new Hono();
  routes.get('/', async (context) => {
    const [products, orders, customers, byStatus, recentOrders] =
      await Promise.all([
        countRows(main, 'products'),
        aggregateOrders(main),
        countRows(crm, 'customers'),
        main.query
          .selectFrom('orders')
          .select((eb) => [
            'status',
            eb.fn.countAll<number>().as('count'),
            eb.fn.sum<number>('totalAmount').as('amount'),
          ])
          .groupBy('status')
          .orderBy('status')
          .execute(),
        main.query
          .selectFrom('orders')
          .selectAll()
          .orderBy('createdAt', 'desc')
          .limit(5)
          .execute(),
      ]);
    return context.json({
      data: {
        counts: {
          products,
          orders: orders.count,
          crmCustomers: customers,
        },
        revenue: orders.revenue,
        byStatus,
        recentOrders,
      },
    });
  });
  return routes;
}

async function countRows(
  connection: DatabaseConnection,
  table: string,
): Promise<number> {
  const result = await connection.query
    .selectFrom(table)
    .select((eb) => [eb.fn.countAll<number>().as('count')])
    .executeTakeFirstOrThrow<{ count: number | string | bigint }>();
  return Number(result.count);
}

async function aggregateOrders(
  connection: DatabaseConnection,
): Promise<{ count: number; revenue: number }> {
  const result = await connection.query
    .selectFrom('orders')
    .select((eb) => [
      eb.fn.countAll<number>().as('count'),
      eb.fn.sum<number>('totalAmount').as('revenue'),
    ])
    .executeTakeFirstOrThrow<{
      count: number | string | bigint;
      revenue: number | string | null;
    }>();
  return { count: Number(result.count), revenue: Number(result.revenue ?? 0) };
}
