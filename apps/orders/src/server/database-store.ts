import type { DatabaseManager } from '@nocobase/database';
import type { Knex } from 'knex';

import {
  OrdersStoreError,
  type Customer,
  type Order,
  type OrderDraft,
  type OrderLine,
  type OrdersDashboard,
  type OrdersState,
  type OrderStatus,
  type PaymentStatus,
  type Product,
} from './store.js';

const allowedTransitions: Record<OrderStatus, readonly OrderStatus[]> = {
  draft: ['pending', 'cancelled'],
  pending: ['processing', 'cancelled'],
  processing: ['shipped', 'cancelled'],
  shipped: ['completed'],
  completed: [],
  cancelled: [],
};

export class DatabaseOrdersStore {
  constructor(private readonly database: DatabaseManager) {}

  async snapshot(): Promise<OrdersState> {
    const knex = await this.database.connection().client<Knex>();
    const customers = await knex('app_orders_customers')
      .select('*')
      .orderBy('createdAt', 'desc');
    const products = await knex('app_orders_products')
      .select('*')
      .orderBy('createdAt', 'desc');
    const orderRows = await knex('app_orders_orders')
      .select('*')
      .orderBy('placedAt', 'desc');
    const lineRows = await knex('app_orders_order_lines')
      .select('*')
      .orderBy('id', 'asc');
    const sequence = await knex<Record<string, unknown>>('app_orders_meta')
      .where({ key: 'nextSequence' })
      .first();
    const linesByOrder = new Map<string, OrderLine[]>();
    for (const row of lineRows as Record<string, unknown>[]) {
      const orderId = stringValue(row.orderId);
      const lines = linesByOrder.get(orderId) ?? [];
      lines.push({
        productId: stringValue(row.productId),
        productName: stringValue(row.productName),
        quantity: numberValue(row.quantity),
        unitPrice: numberValue(row.unitPrice),
        subtotal: numberValue(row.subtotal),
      });
      linesByOrder.set(orderId, lines);
    }
    return {
      schemaVersion: 1,
      nextSequence: numberValue((sequence as Record<string, unknown>)?.value),
      customers: (customers as Record<string, unknown>[]).map(toCustomer),
      products: (products as Record<string, unknown>[]).map(toProduct),
      orders: (orderRows as Record<string, unknown>[]).map((row) =>
        toOrder(row, linesByOrder.get(stringValue(row.id)) ?? []),
      ),
    };
  }

  async dashboard(): Promise<OrdersDashboard> {
    const { orders } = await this.snapshot();
    const statusCounts: Record<OrderStatus, number> = {
      draft: 0,
      pending: 0,
      processing: 0,
      shipped: 0,
      completed: 0,
      cancelled: 0,
    };
    for (const order of orders) statusCounts[order.status] += 1;
    return {
      orderCount: orders.length,
      pendingCount: statusCounts.pending,
      inFulfillmentCount: statusCounts.processing + statusCounts.shipped,
      completedRevenue: sum(
        orders
          .filter((order) => order.status === 'completed')
          .map((order) => order.totalAmount),
      ),
      totalRevenue: sum(
        orders
          .filter((order) => order.status !== 'cancelled')
          .map((order) => order.totalAmount),
      ),
      statusCounts,
    };
  }

  async createOrder(draft: OrderDraft): Promise<Order> {
    return this.database.transaction(async (connection) => {
      const knex = await connection.client<Knex>();
      const customer = await requireCustomer(knex, draft.customerId);
      const lines = await buildLines(knex, draft.lines);
      const sequence = await takeSequence(knex, 'nextSequence');
      const now = new Date().toISOString();
      const order: Order = {
        id: `ord_${String(sequence).padStart(6, '0')}`,
        orderNo: `SO-${new Date().getUTCFullYear()}-${String(sequence).padStart(5, '0')}`,
        customerId: customer.id,
        customerName: customer.name,
        status: 'draft',
        paymentStatus: 'unpaid',
        totalAmount: sum(lines.map((line) => line.subtotal)),
        lines,
        notes: normalizeText(draft.notes, 1000),
        placedAt: now,
        createdAt: now,
        updatedAt: now,
      };
      await insertOrder(knex, order);
      return order;
    });
  }

  async updateOrder(
    id: string,
    input: Partial<OrderDraft> & { paymentStatus?: PaymentStatus },
  ): Promise<Order> {
    return this.database.transaction(async (connection) => {
      const knex = await connection.client<Knex>();
      const order = await requireOrder(knex, id);
      if (order.status !== 'draft') {
        throw new OrdersStoreError('只有草稿订单可以修改业务内容', {
          status: 409,
          code: 'ORDER_NOT_EDITABLE',
        });
      }
      const updates: Record<string, unknown> = {};
      let lines = order.lines;
      if (input.customerId !== undefined) {
        const customer = await requireCustomer(knex, input.customerId);
        updates.customerId = customer.id;
        updates.customerName = customer.name;
      }
      if (input.lines !== undefined) {
        lines = await buildLines(knex, input.lines);
        updates.totalAmount = sum(lines.map((line) => line.subtotal));
        await knex('app_orders_order_lines').where({ orderId: id }).delete();
        await insertLines(knex, id, lines);
      }
      if (input.notes !== undefined)
        updates.notes = normalizeText(input.notes, 1000);
      if (input.paymentStatus !== undefined)
        updates.paymentStatus = requirePaymentStatus(input.paymentStatus);
      updates.updatedAt = new Date().toISOString();
      await knex('app_orders_orders').where({ id }).update(updates);
      return {
        ...order,
        ...updates,
        lines,
        totalAmount: numberValue(updates.totalAmount ?? order.totalAmount),
        customerId: stringValue(updates.customerId ?? order.customerId),
        customerName: stringValue(updates.customerName ?? order.customerName),
        notes: stringValue(updates.notes ?? order.notes),
        paymentStatus: (updates.paymentStatus ??
          order.paymentStatus) as PaymentStatus,
        updatedAt: stringValue(updates.updatedAt),
      };
    });
  }

  async transitionOrder(id: string, nextStatus: OrderStatus): Promise<Order> {
    return this.database.transaction(async (connection) => {
      const knex = await connection.client<Knex>();
      const order = await requireOrder(knex, id);
      if (!allowedTransitions[order.status].includes(nextStatus)) {
        throw new OrdersStoreError(
          `订单不能从 ${order.status} 直接变更为 ${nextStatus}`,
          { status: 409, code: 'INVALID_ORDER_TRANSITION' },
        );
      }
      const updatedAt = new Date().toISOString();
      const paymentStatus =
        nextStatus === 'completed' ? 'paid' : order.paymentStatus;
      await knex('app_orders_orders').where({ id }).update({
        status: nextStatus,
        paymentStatus,
        updatedAt,
      });
      return { ...order, status: nextStatus, paymentStatus, updatedAt };
    });
  }

  async deleteOrder(id: string): Promise<void> {
    await this.database.transaction(async (connection) => {
      const knex = await connection.client<Knex>();
      const order = await requireOrder(knex, id);
      if (order.status !== 'draft' && order.status !== 'cancelled') {
        throw new OrdersStoreError('只能删除草稿或已取消订单', {
          status: 409,
          code: 'ORDER_DELETE_BLOCKED',
        });
      }
      await knex('app_orders_order_lines').where({ orderId: id }).delete();
      await knex('app_orders_orders').where({ id }).delete();
    });
  }

  async createCustomer(
    input: Omit<Customer, 'id' | 'createdAt'>,
  ): Promise<Customer> {
    return this.database.transaction(async (connection) => {
      const knex = await connection.client<Knex>();
      const name = requireText(input.name, '客户名称', 160);
      if (await knex('app_orders_customers').where({ name }).first()) {
        throw new OrdersStoreError('客户名称已存在', {
          status: 409,
          code: 'CUSTOMER_EXISTS',
        });
      }
      const sequence = (await knex('app_orders_customers')
        .count({ count: '*' })
        .first()) as { count?: number | string };
      const customer: Customer = {
        id: `cus_${String(Number(sequence.count ?? 0) + 1).padStart(4, '0')}`,
        name,
        contactName: normalizeText(input.contactName, 120),
        phone: normalizeText(input.phone, 64),
        email: normalizeText(input.email, 320),
        level: requireCustomerLevel(input.level),
        createdAt: new Date().toISOString(),
      };
      await knex('app_orders_customers').insert(customer);
      return customer;
    });
  }

  async createProduct(
    input: Omit<Product, 'id' | 'createdAt'>,
  ): Promise<Product> {
    return this.database.transaction(async (connection) => {
      const knex = await connection.client<Knex>();
      const sku = requireText(input.sku, 'SKU', 64);
      if (await knex('app_orders_products').where({ sku }).first()) {
        throw new OrdersStoreError('SKU 已存在', {
          status: 409,
          code: 'PRODUCT_EXISTS',
        });
      }
      const sequence = (await knex('app_orders_products')
        .count({ count: '*' })
        .first()) as { count?: number | string };
      const product: Product = {
        id: `prd_${String(Number(sequence.count ?? 0) + 1).padStart(4, '0')}`,
        sku,
        name: requireText(input.name, '商品名称', 160),
        category: normalizeText(input.category, 120),
        price: requireMoney(input.price, '商品价格'),
        stock: requireInteger(input.stock, '库存', 0),
        status: input.status === 'inactive' ? 'inactive' : 'active',
        createdAt: new Date().toISOString(),
      };
      await knex('app_orders_products').insert(product);
      return product;
    });
  }
}

async function requireOrder(knex: Knex, id: string): Promise<Order> {
  const row = (await knex('app_orders_orders').where({ id }).first()) as
    Record<string, unknown> | undefined;
  if (!row) throw notFound('订单');
  const lines = (await knex('app_orders_order_lines')
    .where({ orderId: id })
    .orderBy('id', 'asc')) as Record<string, unknown>[];
  return toOrder(
    row,
    lines.map((line) => ({
      productId: stringValue(line.productId),
      productName: stringValue(line.productName),
      quantity: numberValue(line.quantity),
      unitPrice: numberValue(line.unitPrice),
      subtotal: numberValue(line.subtotal),
    })),
  );
}

async function requireCustomer(knex: Knex, id: string): Promise<Customer> {
  const row = (await knex('app_orders_customers').where({ id }).first()) as
    Record<string, unknown> | undefined;
  if (!row) throw notFound('客户');
  return toCustomer(row);
}

async function buildLines(
  knex: Knex,
  input: Array<{ productId: string; quantity: number }>,
): Promise<OrderLine[]> {
  if (!Array.isArray(input) || input.length === 0 || input.length > 30) {
    throw new OrdersStoreError('订单至少需要 1 个商品，最多 30 个', {
      status: 400,
      code: 'INVALID_ORDER_LINES',
    });
  }
  const merged = new Map<string, number>();
  for (const line of input) {
    const quantity = requireInteger(line.quantity, '商品数量', 1);
    merged.set(line.productId, (merged.get(line.productId) ?? 0) + quantity);
  }
  const result: OrderLine[] = [];
  for (const [productId, quantity] of merged) {
    const row = (await knex('app_orders_products')
      .where({ id: productId, status: 'active' })
      .first()) as Record<string, unknown> | undefined;
    if (!row) throw notFound('可售商品');
    const product = toProduct(row);
    if (quantity > product.stock) {
      throw new OrdersStoreError(`${product.name} 库存不足`, {
        status: 409,
        code: 'INSUFFICIENT_STOCK',
      });
    }
    result.push({
      productId,
      productName: product.name,
      quantity,
      unitPrice: product.price,
      subtotal: roundMoney(product.price * quantity),
    });
  }
  return result;
}

async function insertOrder(knex: Knex, order: Order): Promise<void> {
  const { lines, ...row } = order;
  await knex('app_orders_orders').insert(row);
  await insertLines(knex, order.id, lines);
}

async function insertLines(
  knex: Knex,
  orderId: string,
  lines: OrderLine[],
): Promise<void> {
  if (lines.length)
    await knex('app_orders_order_lines').insert(
      lines.map((line) => ({ orderId, ...line })),
    );
}

async function takeSequence(knex: Knex, key: string): Promise<number> {
  const row = (await knex('app_orders_meta').where({ key }).first()) as
    { value?: number | string } | undefined;
  const value = Number(row?.value ?? 1);
  if (row)
    await knex('app_orders_meta')
      .where({ key })
      .update({ value: value + 1 });
  else await knex('app_orders_meta').insert({ key, value: value + 1 });
  return value;
}

function toCustomer(row: Record<string, unknown>): Customer {
  return {
    id: stringValue(row.id),
    name: stringValue(row.name),
    contactName: stringValue(row.contactName),
    phone: stringValue(row.phone),
    email: stringValue(row.email),
    level: requireCustomerLevel(row.level),
    createdAt: dateValue(row.createdAt),
  };
}

function toProduct(row: Record<string, unknown>): Product {
  return {
    id: stringValue(row.id),
    sku: stringValue(row.sku),
    name: stringValue(row.name),
    category: stringValue(row.category),
    price: numberValue(row.price),
    stock: numberValue(row.stock),
    status: row.status === 'inactive' ? 'inactive' : 'active',
    createdAt: dateValue(row.createdAt),
  };
}

function toOrder(row: Record<string, unknown>, lines: OrderLine[]): Order {
  return {
    id: stringValue(row.id),
    orderNo: stringValue(row.orderNo),
    customerId: stringValue(row.customerId),
    customerName: stringValue(row.customerName),
    status: requireOrderStatus(row.status),
    paymentStatus: requirePaymentStatus(row.paymentStatus),
    totalAmount: numberValue(row.totalAmount),
    lines,
    notes: stringValue(row.notes),
    placedAt: dateValue(row.placedAt),
    createdAt: dateValue(row.createdAt),
    updatedAt: dateValue(row.updatedAt),
  };
}

function requireOrderStatus(value: unknown): OrderStatus {
  if (
    value === 'draft' ||
    value === 'pending' ||
    value === 'processing' ||
    value === 'shipped' ||
    value === 'completed' ||
    value === 'cancelled'
  )
    return value;
  throw new OrdersStoreError('订单状态无效', {
    status: 500,
    code: 'INVALID_STORED_STATE',
  });
}

function requirePaymentStatus(value: unknown): PaymentStatus {
  if (
    value === 'unpaid' ||
    value === 'partial' ||
    value === 'paid' ||
    value === 'refunded'
  )
    return value;
  throw new OrdersStoreError('付款状态无效', {
    status: 400,
    code: 'VALIDATION_ERROR',
  });
}

function requireCustomerLevel(value: unknown): Customer['level'] {
  if (value === 'key' || value === 'strategic') return value;
  return 'standard';
}

function requireText(value: unknown, label: string, maxLength: number): string {
  const normalized = normalizeText(value, maxLength);
  if (!normalized)
    throw new OrdersStoreError(`${label}不能为空`, {
      status: 400,
      code: 'VALIDATION_ERROR',
    });
  return normalized;
}

function normalizeText(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function requireMoney(value: unknown, label: string): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 100_000_000)
    throw new OrdersStoreError(`${label}格式不正确`, {
      status: 400,
      code: 'VALIDATION_ERROR',
    });
  return roundMoney(number);
}

function requireInteger(
  value: unknown,
  label: string,
  minimum: number,
): number {
  const number = Number(value);
  if (!Number.isInteger(number) || number < minimum || number > 1_000_000)
    throw new OrdersStoreError(`${label}格式不正确`, {
      status: 400,
      code: 'VALIDATION_ERROR',
    });
  return number;
}

function notFound(label: string): OrdersStoreError {
  return new OrdersStoreError(`${label}不存在`, {
    status: 404,
    code: 'NOT_FOUND',
  });
}

function stringValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (
    typeof value === 'number' ||
    typeof value === 'bigint' ||
    typeof value === 'boolean'
  )
    return String(value);
  return '';
}

function numberValue(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function dateValue(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'number' && Number.isFinite(value))
    return new Date(value).toISOString();
  if (typeof value === 'bigint') return new Date(Number(value)).toISOString();
  if (typeof value === 'string' && value.trim()) {
    const numeric = Number(value);
    return new Date(Number.isFinite(numeric) ? numeric : value).toISOString();
  }
  throw new OrdersStoreError('订单日期无效', {
    status: 500,
    code: 'INVALID_STORED_STATE',
  });
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function sum(values: number[]): number {
  return roundMoney(values.reduce((total, value) => total + value, 0));
}
