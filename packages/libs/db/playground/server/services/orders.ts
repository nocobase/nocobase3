import type { DatabaseConnection } from '@nocobase/db';
import { PlaygroundHttpError } from '../errors.js';

export interface CreateOrderItemInput {
  readonly productId: number;
  readonly quantity: number;
}

export interface CreateOrderInput {
  readonly orderNo: string;
  readonly customerId: number;
  readonly items: readonly CreateOrderItemInput[];
}

export class OrderService {
  constructor(
    private readonly main: DatabaseConnection,
    private readonly crm: DatabaseConnection,
  ) {}

  async list(): Promise<Record<string, unknown>[]> {
    return this.main.query
      .selectFrom('orders')
      .selectAll()
      .orderBy('createdAt', 'desc')
      .execute();
  }

  async get(id: number): Promise<Record<string, unknown>> {
    const order = await this.main.query
      .selectFrom('orders')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    if (!order) {
      throw new PlaygroundHttpError(404, 'ORDER_NOT_FOUND', 'Order not found.');
    }
    const items = await this.main.query
      .selectFrom('orderItems as item')
      .innerJoin('products as product', 'item.productId', 'product.id')
      .select([
        'item.id as id',
        'item.productId as productId',
        'product.name as productName',
        'product.sku as sku',
        'item.quantity as quantity',
        'item.unitPrice as unitPrice',
        'item.subtotal as subtotal',
      ])
      .where('item.orderId', '=', id)
      .orderBy('item.id')
      .execute();
    return { ...order, items };
  }

  async create(input: CreateOrderInput): Promise<Record<string, unknown>> {
    const customer = await this.crm.query
      .selectFrom('customers')
      .select(['id', 'name', 'status'])
      .where('id', '=', input.customerId)
      .executeTakeFirst();
    if (!customer) {
      throw new PlaygroundHttpError(
        404,
        'CUSTOMER_NOT_FOUND',
        'CRM customer not found.',
      );
    }
    if (customer.status !== 'active') {
      throw new PlaygroundHttpError(
        409,
        'CUSTOMER_INACTIVE',
        'Orders can only be created for active CRM customers.',
      );
    }

    const orderId = await this.main.transaction(async (transaction) => {
      const items: Array<{
        productId: number;
        quantity: number;
        unitPrice: number;
        subtotal: number;
      }> = [];
      let totalAmount = 0;
      for (const requested of input.items) {
        const product = await transaction.query
          .selectFrom('products')
          .select(['id', 'price', 'stock', 'name'])
          .where('id', '=', requested.productId)
          .executeTakeFirst();
        if (!product) {
          throw new PlaygroundHttpError(
            404,
            'PRODUCT_NOT_FOUND',
            `Product ${requested.productId} was not found.`,
          );
        }
        const stock = Number(product.stock);
        if (stock < requested.quantity) {
          throw new PlaygroundHttpError(
            409,
            'INSUFFICIENT_STOCK',
            `${String(product.name)} only has ${stock} unit(s) in stock.`,
          );
        }
        const unitPrice = Number(product.price);
        const subtotal = money(unitPrice * requested.quantity);
        totalAmount = money(totalAmount + subtotal);
        items.push({ ...requested, unitPrice, subtotal });
      }

      const insert = await transaction.query
        .insertInto('orders')
        .values({
          orderNo: input.orderNo,
          externalCustomerId: input.customerId,
          customerNameSnapshot: customer.name,
          status: 'draft',
          totalAmount,
          createdAt: new Date().toISOString(),
        })
        .execute();
      const insertedOrderId = Number(insert.insertId);
      if (!Number.isInteger(insertedOrderId)) {
        throw new Error('SQLite did not return an inserted order ID.');
      }

      for (const item of items) {
        await transaction.query
          .insertInto('orderItems')
          .values({ orderId: insertedOrderId, ...item })
          .execute();
        const product = await transaction.query
          .selectFrom('products')
          .select('stock')
          .where('id', '=', item.productId)
          .executeTakeFirstOrThrow();
        await transaction.query
          .updateTable('products')
          .set({ stock: Number(product.stock) - item.quantity })
          .where('id', '=', item.productId)
          .execute();
      }
      return insertedOrderId;
    });

    return this.get(orderId);
  }

  async updateStatus(
    id: number,
    status: 'draft' | 'paid' | 'cancelled',
  ): Promise<Record<string, unknown>> {
    const result = await this.main.query
      .updateTable('orders')
      .set({ status })
      .where('id', '=', id)
      .execute();
    if (result.updatedCount === 0) {
      throw new PlaygroundHttpError(404, 'ORDER_NOT_FOUND', 'Order not found.');
    }
    return this.get(id);
  }

  async delete(id: number): Promise<void> {
    await this.main.transaction(async (transaction) => {
      const order = await transaction.query
        .selectFrom('orders')
        .select(['id', 'status'])
        .where('id', '=', id)
        .executeTakeFirst();
      if (!order) {
        throw new PlaygroundHttpError(
          404,
          'ORDER_NOT_FOUND',
          'Order not found.',
        );
      }
      if (order.status === 'paid') {
        throw new PlaygroundHttpError(
          409,
          'PAID_ORDER_DELETE_NOT_ALLOWED',
          'Paid orders cannot be deleted.',
        );
      }
      const items = await transaction.query
        .selectFrom('orderItems')
        .select(['productId', 'quantity'])
        .where('orderId', '=', id)
        .execute();
      for (const item of items) {
        const product = await transaction.query
          .selectFrom('products')
          .select('stock')
          .where('id', '=', item.productId)
          .executeTakeFirstOrThrow();
        await transaction.query
          .updateTable('products')
          .set({ stock: Number(product.stock) + Number(item.quantity) })
          .where('id', '=', item.productId)
          .execute();
      }
      await transaction.query
        .deleteFrom('orderItems')
        .where('orderId', '=', id)
        .execute();
      await transaction.query
        .deleteFrom('orders')
        .where('id', '=', id)
        .execute();
    });
  }
}

function money(value: number): number {
  return Math.round(value * 100) / 100;
}
