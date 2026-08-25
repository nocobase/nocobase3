import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

export type OrderStatus =
  'draft' | 'pending' | 'processing' | 'shipped' | 'completed' | 'cancelled';

export type PaymentStatus = 'unpaid' | 'partial' | 'paid' | 'refunded';

export interface Customer {
  id: string;
  name: string;
  contactName: string;
  phone: string;
  email: string;
  level: 'standard' | 'key' | 'strategic';
  createdAt: string;
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  category: string;
  price: number;
  stock: number;
  status: 'active' | 'inactive';
  createdAt: string;
}

export interface OrderLine {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

export interface Order {
  id: string;
  orderNo: string;
  customerId: string;
  customerName: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  totalAmount: number;
  lines: OrderLine[];
  notes: string;
  placedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrdersState {
  schemaVersion: 1;
  nextSequence: number;
  customers: Customer[];
  products: Product[];
  orders: Order[];
}

export interface OrderDraft {
  customerId: string;
  lines: Array<{ productId: string; quantity: number }>;
  notes?: string;
}

export interface OrdersDashboard {
  orderCount: number;
  pendingCount: number;
  inFulfillmentCount: number;
  completedRevenue: number;
  totalRevenue: number;
  statusCounts: Record<OrderStatus, number>;
}

const allowedTransitions: Record<OrderStatus, OrderStatus[]> = {
  draft: ['pending', 'cancelled'],
  pending: ['processing', 'cancelled'],
  processing: ['shipped', 'cancelled'],
  shipped: ['completed'],
  completed: [],
  cancelled: [],
};

export class OrdersStoreError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, options: { status: number; code: string }) {
    super(message);
    this.name = 'OrdersStoreError';
    this.status = options.status;
    this.code = options.code;
  }
}

export class OrdersStore {
  private state: OrdersState | undefined;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(private readonly filePath: string) {}

  async ready(): Promise<void> {
    if (this.state) return;
    await mkdir(path.dirname(this.filePath), { recursive: true });
    try {
      this.state = parseState(await readFile(this.filePath, 'utf8'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      this.state = createSeedState();
      await this.persist();
    }
  }

  async snapshot(): Promise<OrdersState> {
    await this.ready();
    return structuredClone(this.requireState());
  }

  async dashboard(): Promise<OrdersDashboard> {
    const state = await this.snapshot();
    const statusCounts: Record<OrderStatus, number> = {
      draft: 0,
      pending: 0,
      processing: 0,
      shipped: 0,
      completed: 0,
      cancelled: 0,
    };
    for (const order of state.orders) statusCounts[order.status] += 1;
    return {
      orderCount: state.orders.length,
      pendingCount: statusCounts.pending,
      inFulfillmentCount: statusCounts.processing + statusCounts.shipped,
      completedRevenue: sum(
        state.orders
          .filter((order) => order.status === 'completed')
          .map((order) => order.totalAmount),
      ),
      totalRevenue: sum(
        state.orders
          .filter((order) => order.status !== 'cancelled')
          .map((order) => order.totalAmount),
      ),
      statusCounts,
    };
  }

  async createOrder(draft: OrderDraft): Promise<Order> {
    return this.mutate((state) => {
      const customer = requireCustomer(state, draft.customerId);
      const lines = buildLines(state, draft.lines);
      const now = new Date().toISOString();
      const order: Order = {
        id: `ord_${String(state.nextSequence).padStart(6, '0')}`,
        orderNo: `SO-${new Date().getUTCFullYear()}-${String(state.nextSequence).padStart(5, '0')}`,
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
      state.nextSequence += 1;
      state.orders.unshift(order);
      return order;
    });
  }

  async updateOrder(
    id: string,
    input: Partial<OrderDraft> & { paymentStatus?: PaymentStatus },
  ): Promise<Order> {
    return this.mutate((state) => {
      const order = requireOrder(state, id);
      if (order.status !== 'draft') {
        throw new OrdersStoreError('只有草稿订单可以修改业务内容', {
          status: 409,
          code: 'ORDER_NOT_EDITABLE',
        });
      }
      if (input.customerId !== undefined) {
        const customer = requireCustomer(state, input.customerId);
        order.customerId = customer.id;
        order.customerName = customer.name;
      }
      if (input.lines !== undefined) {
        order.lines = buildLines(state, input.lines);
        order.totalAmount = sum(order.lines.map((line) => line.subtotal));
      }
      if (input.notes !== undefined) {
        order.notes = normalizeText(input.notes, 1000);
      }
      if (input.paymentStatus !== undefined) {
        order.paymentStatus = requirePaymentStatus(input.paymentStatus);
      }
      order.updatedAt = new Date().toISOString();
      return order;
    });
  }

  async transitionOrder(id: string, nextStatus: OrderStatus): Promise<Order> {
    return this.mutate((state) => {
      const order = requireOrder(state, id);
      if (!allowedTransitions[order.status].includes(nextStatus)) {
        throw new OrdersStoreError(
          `订单不能从 ${order.status} 直接变更为 ${nextStatus}`,
          { status: 409, code: 'INVALID_ORDER_TRANSITION' },
        );
      }
      order.status = nextStatus;
      if (nextStatus === 'completed') order.paymentStatus = 'paid';
      order.updatedAt = new Date().toISOString();
      return order;
    });
  }

  async deleteOrder(id: string): Promise<void> {
    await this.mutate((state) => {
      const index = state.orders.findIndex((order) => order.id === id);
      if (index < 0) throw notFound('订单');
      const order = state.orders[index];
      if (order.status !== 'draft' && order.status !== 'cancelled') {
        throw new OrdersStoreError('只能删除草稿或已取消订单', {
          status: 409,
          code: 'ORDER_DELETE_BLOCKED',
        });
      }
      state.orders.splice(index, 1);
    });
  }

  async createCustomer(
    input: Omit<Customer, 'id' | 'createdAt'>,
  ): Promise<Customer> {
    return this.mutate((state) => {
      const name = requireText(input.name, '客户名称', 160);
      if (state.customers.some((customer) => customer.name === name)) {
        throw new OrdersStoreError('客户名称已存在', {
          status: 409,
          code: 'CUSTOMER_EXISTS',
        });
      }
      const customer: Customer = {
        id: `cus_${String(state.customers.length + 1).padStart(4, '0')}`,
        name,
        contactName: normalizeText(input.contactName, 120),
        phone: normalizeText(input.phone, 64),
        email: normalizeText(input.email, 320),
        level: requireCustomerLevel(input.level),
        createdAt: new Date().toISOString(),
      };
      state.customers.unshift(customer);
      return customer;
    });
  }

  async createProduct(
    input: Omit<Product, 'id' | 'createdAt'>,
  ): Promise<Product> {
    return this.mutate((state) => {
      const sku = requireText(input.sku, 'SKU', 64);
      if (state.products.some((product) => product.sku === sku)) {
        throw new OrdersStoreError('SKU 已存在', {
          status: 409,
          code: 'PRODUCT_EXISTS',
        });
      }
      const product: Product = {
        id: `prd_${String(state.products.length + 1).padStart(4, '0')}`,
        sku,
        name: requireText(input.name, '商品名称', 160),
        category: normalizeText(input.category, 120),
        price: requireMoney(input.price, '商品价格'),
        stock: requireInteger(input.stock, '库存', 0),
        status: input.status === 'inactive' ? 'inactive' : 'active',
        createdAt: new Date().toISOString(),
      };
      state.products.unshift(product);
      return product;
    });
  }

  private async mutate<T>(operation: (state: OrdersState) => T): Promise<T> {
    await this.ready();
    let result!: T;
    const nextWrite = this.writeQueue.then(async () => {
      const nextState = structuredClone(this.requireState());
      result = operation(nextState);
      this.state = nextState;
      await this.persist();
    });
    this.writeQueue = nextWrite.catch(() => undefined);
    await nextWrite;
    return structuredClone(result);
  }

  private async persist(): Promise<void> {
    const temporaryPath = `${this.filePath}.${process.pid}.tmp`;
    await writeFile(
      temporaryPath,
      `${JSON.stringify(this.requireState(), null, 2)}\n`,
      'utf8',
    );
    await rename(temporaryPath, this.filePath);
  }

  private requireState(): OrdersState {
    if (!this.state) throw new Error('Orders store has not been initialized');
    return this.state;
  }
}

function buildLines(
  state: OrdersState,
  input: Array<{ productId: string; quantity: number }>,
): OrderLine[] {
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
  return [...merged.entries()].map(([productId, quantity]) => {
    const product = state.products.find((item) => item.id === productId);
    if (!product || product.status !== 'active') throw notFound('可售商品');
    if (quantity > product.stock) {
      throw new OrdersStoreError(`${product.name} 库存不足`, {
        status: 409,
        code: 'INSUFFICIENT_STOCK',
      });
    }
    return {
      productId,
      productName: product.name,
      quantity,
      unitPrice: product.price,
      subtotal: roundMoney(product.price * quantity),
    };
  });
}

function requireCustomer(state: OrdersState, id: string): Customer {
  const customer = state.customers.find((item) => item.id === id);
  if (!customer) throw notFound('客户');
  return customer;
}

function requireOrder(state: OrdersState, id: string): Order {
  const order = state.orders.find((item) => item.id === id);
  if (!order) throw notFound('订单');
  return order;
}

function notFound(label: string): OrdersStoreError {
  return new OrdersStoreError(`${label}不存在`, {
    status: 404,
    code: 'NOT_FOUND',
  });
}

function requireText(value: unknown, label: string, maxLength: number): string {
  const normalized = normalizeText(value, maxLength);
  if (!normalized) {
    throw new OrdersStoreError(`${label}不能为空`, {
      status: 400,
      code: 'VALIDATION_ERROR',
    });
  }
  return normalized;
}

function normalizeText(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function requireMoney(value: unknown, label: string): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 100_000_000) {
    throw new OrdersStoreError(`${label}格式不正确`, {
      status: 400,
      code: 'VALIDATION_ERROR',
    });
  }
  return roundMoney(number);
}

function requireInteger(
  value: unknown,
  label: string,
  minimum: number,
): number {
  const number = Number(value);
  if (!Number.isInteger(number) || number < minimum || number > 1_000_000) {
    throw new OrdersStoreError(`${label}格式不正确`, {
      status: 400,
      code: 'VALIDATION_ERROR',
    });
  }
  return number;
}

function requirePaymentStatus(value: unknown): PaymentStatus {
  if (
    value === 'unpaid' ||
    value === 'partial' ||
    value === 'paid' ||
    value === 'refunded'
  ) {
    return value;
  }
  throw new OrdersStoreError('付款状态无效', {
    status: 400,
    code: 'VALIDATION_ERROR',
  });
}

function requireCustomerLevel(value: unknown): Customer['level'] {
  if (value === 'key' || value === 'strategic') return value;
  return 'standard';
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function sum(values: number[]): number {
  return roundMoney(values.reduce((total, value) => total + value, 0));
}

function parseState(content: string): OrdersState {
  const value = JSON.parse(content) as OrdersState;
  if (value?.schemaVersion !== 1 || !Array.isArray(value.orders)) {
    throw new Error('Orders data file uses an unsupported schema');
  }
  return value;
}

export function createSeedState(): OrdersState {
  const now = new Date().toISOString();
  const customers: Customer[] = [
    [
      'cus_0001',
      '杭州云岭科技',
      '陈敏',
      '138****6038',
      'chenmin@example.com',
      'strategic',
    ],
    [
      'cus_0002',
      '上海星环零售',
      '周航',
      '139****1926',
      'zhouhang@example.com',
      'key',
    ],
    [
      'cus_0003',
      '成都智造工场',
      '刘欣',
      '136****3057',
      'liuxin@example.com',
      'key',
    ],
    [
      'cus_0004',
      '深圳南山设计',
      '王睿',
      '135****8452',
      'wangrui@example.com',
      'standard',
    ],
  ].map(([id, name, contactName, phone, email, level]) => ({
    id,
    name,
    contactName,
    phone,
    email,
    level: level as Customer['level'],
    createdAt: now,
  }));
  const products: Product[] = [
    ['prd_0001', 'NB-ENT-01', '企业应用平台授权', '软件授权', 128000, 80],
    ['prd_0002', 'NB-AI-01', 'Agent 开发套件', 'AI 套件', 68000, 120],
    ['prd_0003', 'NB-OPS-01', '生产运维保障服务', '专业服务', 36000, 60],
    ['prd_0004', 'NB-IMP-01', '实施交付服务包', '专业服务', 48000, 40],
    ['prd_0005', 'NB-INT-01', '企业集成连接包', '集成服务', 28000, 100],
  ].map(([id, sku, name, category, price, stock]) => ({
    id: String(id),
    sku: String(sku),
    name: String(name),
    category: String(category),
    price: Number(price),
    stock: Number(stock),
    status: 'active' as const,
    createdAt: now,
  }));
  const specs = [
    [
      'cus_0001',
      'processing',
      'paid',
      [
        ['prd_0001', 1],
        ['prd_0003', 1],
      ],
    ],
    [
      'cus_0002',
      'pending',
      'partial',
      [
        ['prd_0002', 2],
        ['prd_0005', 1],
      ],
    ],
    [
      'cus_0003',
      'shipped',
      'paid',
      [
        ['prd_0001', 1],
        ['prd_0004', 1],
      ],
    ],
    ['cus_0004', 'draft', 'unpaid', [['prd_0002', 1]]],
    [
      'cus_0001',
      'completed',
      'paid',
      [
        ['prd_0005', 3],
        ['prd_0004', 1],
      ],
    ],
    ['cus_0002', 'completed', 'paid', [['prd_0001', 1]]],
    ['cus_0003', 'cancelled', 'refunded', [['prd_0003', 1]]],
    ['cus_0004', 'pending', 'unpaid', [['prd_0005', 2]]],
  ] as const;
  const orders = specs.map(
    ([customerId, status, paymentStatus, lineSpecs], index) => {
      const customer = customers.find((item) => item.id === customerId)!;
      const lines = lineSpecs.map(([productId, quantity]) => {
        const product = products.find((item) => item.id === productId)!;
        return {
          productId,
          productName: product.name,
          quantity,
          unitPrice: product.price,
          subtotal: product.price * quantity,
        };
      });
      const placedAt = new Date(Date.now() - index * 86_400_000).toISOString();
      return {
        id: `ord_${String(index + 1).padStart(6, '0')}`,
        orderNo: `SO-${new Date().getUTCFullYear()}-${String(index + 1).padStart(5, '0')}`,
        customerId,
        customerName: customer.name,
        status,
        paymentStatus,
        totalAmount: sum(lines.map((line) => line.subtotal)),
        lines,
        notes: index === 0 ? '重点客户，交付前同步实施计划。' : '',
        placedAt,
        createdAt: placedAt,
        updatedAt: placedAt,
      } satisfies Order;
    },
  );
  return {
    schemaVersion: 1,
    nextSequence: orders.length + 1,
    customers,
    products,
    orders,
  };
}
