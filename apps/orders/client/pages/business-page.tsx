import { useAppClient } from '@nocobase/app-client';
import {
  AlertTriangle,
  ArrowRight,
  CircleDollarSign,
  Clock3,
  PackageCheck,
  Plus,
  RefreshCw,
  Search,
  ShoppingCart,
  X,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
  type ReactElement,
  type ReactNode,
} from 'react';
import { useLocation, useNavigate } from 'react-router';

type OrderStatus =
  'draft' | 'pending' | 'processing' | 'shipped' | 'completed' | 'cancelled';
type PaymentStatus = 'unpaid' | 'partial' | 'paid' | 'refunded';
interface Customer {
  id: string;
  name: string;
  contactName: string;
  phone: string;
  email: string;
  level: 'standard' | 'key' | 'strategic';
  createdAt: string;
}
interface Product {
  id: string;
  sku: string;
  name: string;
  category: string;
  price: number;
  stock: number;
  status: 'active' | 'inactive';
  createdAt: string;
}
interface OrderLine {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}
interface Order {
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
interface OrdersDashboard {
  orderCount: number;
  pendingCount: number;
  inFulfillmentCount: number;
  completedRevenue: number;
  totalRevenue: number;
  statusCounts: Record<OrderStatus, number>;
}
interface OrdersData {
  customers: Customer[];
  products: Product[];
  orders: Order[];
  dashboard: OrdersDashboard;
}

const statusCopy: Record<OrderStatus, string> = {
  draft: '草稿',
  pending: '待确认',
  processing: '履约中',
  shipped: '已发货',
  completed: '已完成',
  cancelled: '已取消',
};
const paymentCopy: Record<PaymentStatus, string> = {
  unpaid: '未付款',
  partial: '部分付款',
  paid: '已付款',
  refunded: '已退款',
};
const transitions: Record<OrderStatus, Array<[OrderStatus, string]>> = {
  draft: [
    ['pending', '提交确认'],
    ['cancelled', '取消订单'],
  ],
  pending: [
    ['processing', '开始履约'],
    ['cancelled', '取消订单'],
  ],
  processing: [
    ['shipped', '确认发货'],
    ['cancelled', '取消订单'],
  ],
  shipped: [['completed', '确认完成']],
  completed: [],
  cancelled: [],
};

export default function BusinessPage(): ReactElement {
  const client = useAppClient();
  const location = useLocation();
  const navigate = useNavigate();
  const [data, setData] = useState<OrdersData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'all' | OrderStatus>('all');
  const [dialog, setDialog] = useState<{
    type: 'order' | 'customer' | 'product' | 'detail';
    order?: Order;
  } | null>(null);
  const load = useCallback(async () => {
    setBusy(true);
    try {
      const response = await client.request<{ data: OrdersData }>('/bootstrap');
      setData(response.data);
      setError(null);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : '订单数据加载失败',
      );
    } finally {
      setBusy(false);
    }
  }, [client]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  const mutate = async (
    path: string,
    init: RequestInit,
    message: string,
  ): Promise<void> => {
    setBusy(true);
    try {
      await client.request(path, init);
      await load();
      setDialog(null);
      window.dispatchEvent(
        new CustomEvent('orders:toast', { detail: message }),
      );
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : '操作失败',
      );
      setBusy(false);
    }
  };
  if (!data)
    return (
      <LoadingState busy={busy} error={error} onRetry={() => void load()} />
    );
  const page = location.pathname.endsWith('/orders')
    ? 'orders'
    : location.pathname.endsWith('/customers')
      ? 'customers'
      : location.pathname.endsWith('/products')
        ? 'products'
        : 'dashboard';
  return (
    <div className='business-content'>
      {error ? (
        <div className='inline-error'>
          <AlertTriangle />
          {error}
          <button onClick={() => setError(null)} type='button'>
            <X />
          </button>
        </div>
      ) : null}
      {page === 'dashboard' ? (
        <Dashboard
          data={data}
          onCreate={() => setDialog({ type: 'order' })}
          onOpen={(order) => setDialog({ type: 'detail', order })}
          onViewAll={() => navigate('/orders')}
        />
      ) : null}
      {page === 'orders' ? (
        <OrdersPage
          data={data}
          search={search}
          status={status}
          onSearch={setSearch}
          onStatus={setStatus}
          onCreate={() => setDialog({ type: 'order' })}
          onOpen={(order) => setDialog({ type: 'detail', order })}
        />
      ) : null}
      {page === 'customers' ? (
        <CustomersPage
          data={data}
          onCreate={() => setDialog({ type: 'customer' })}
        />
      ) : null}
      {page === 'products' ? (
        <ProductsPage
          data={data}
          onCreate={() => setDialog({ type: 'product' })}
        />
      ) : null}
      {dialog ? (
        <Dialog
          title={
            dialog.type === 'order'
              ? '新建订单'
              : dialog.type === 'customer'
                ? '新建客户'
                : dialog.type === 'product'
                  ? '新建商品'
                  : '订单详情'
          }
          onClose={() => setDialog(null)}
        >
          {dialog.type === 'order' ? (
            <OrderForm
              data={data}
              busy={busy}
              onSubmit={(body) =>
                void mutate(
                  '/orders',
                  { method: 'POST', body: JSON.stringify(body) },
                  '订单已创建',
                )
              }
            />
          ) : null}
          {dialog.type === 'customer' ? (
            <CustomerForm
              busy={busy}
              onSubmit={(body) =>
                void mutate(
                  '/customers',
                  { method: 'POST', body: JSON.stringify(body) },
                  '客户已创建',
                )
              }
            />
          ) : null}
          {dialog.type === 'product' ? (
            <ProductForm
              busy={busy}
              onSubmit={(body) =>
                void mutate(
                  '/products',
                  { method: 'POST', body: JSON.stringify(body) },
                  '商品已创建',
                )
              }
            />
          ) : null}
          {dialog.type === 'detail' && dialog.order ? (
            <OrderDetail
              order={dialog.order}
              busy={busy}
              onDelete={() =>
                void mutate(
                  `/orders/${dialog.order!.id}`,
                  { method: 'DELETE' },
                  '订单已删除',
                )
              }
              onTransition={(next) =>
                void mutate(
                  `/orders/${dialog.order!.id}/transition`,
                  { method: 'POST', body: JSON.stringify({ status: next }) },
                  '订单状态已更新',
                )
              }
            />
          ) : null}
        </Dialog>
      ) : null}
    </div>
  );
}

function Dashboard({
  data,
  onCreate,
  onOpen,
  onViewAll,
}: {
  data: OrdersData;
  onCreate: () => void;
  onOpen: (order: Order) => void;
  onViewAll: () => void;
}): ReactElement {
  const maximum = Math.max(...Object.values(data.dashboard.statusCounts), 1);
  return (
    <>
      <PageHeader
        eyebrow='ORDER OPERATIONS'
        title='订单总览'
        description='从下单到履约，集中查看订单规模、收入和当前需要处理的事项。'
        action={
          <PrimaryButton onClick={onCreate}>
            <Plus />
            新建订单
          </PrimaryButton>
        }
      />
      <section className='metric-grid'>
        <Metric
          icon={<ShoppingCart />}
          label='订单总数'
          value={String(data.dashboard.orderCount)}
          hint='全部订单'
          tone='blue'
        />
        <Metric
          icon={<Clock3 />}
          label='待确认'
          value={String(data.dashboard.pendingCount)}
          hint='需要业务确认'
          tone='amber'
        />
        <Metric
          icon={<PackageCheck />}
          label='履约中'
          value={String(data.dashboard.inFulfillmentCount)}
          hint='处理中与已发货'
          tone='violet'
        />
        <Metric
          icon={<CircleDollarSign />}
          label='有效订单额'
          value={money(data.dashboard.totalRevenue)}
          hint={`已完成 ${money(data.dashboard.completedRevenue)}`}
          tone='green'
        />
      </section>
      <section className='dashboard-grid'>
        <Panel
          title='最近订单'
          action={
            <button className='text-action' onClick={onViewAll} type='button'>
              查看全部
              <ArrowRight />
            </button>
          }
        >
          <OrderTable orders={data.orders.slice(0, 6)} onOpen={onOpen} />
        </Panel>
        <Panel
          title='订单状态'
          action={
            <span className='live-label'>
              <span />
              实时
            </span>
          }
        >
          <div className='status-stack'>
            {Object.entries(statusCopy).map(([key, label]) => {
              const count = data.dashboard.statusCounts[key as OrderStatus];
              return (
                <div className='status-row' key={key}>
                  <span>{label}</span>
                  <div>
                    <i
                      style={{
                        width: `${Math.max((count / maximum) * 100, count ? 8 : 0)}%`,
                      }}
                    />
                  </div>
                  <strong>{count}</strong>
                </div>
              );
            })}
          </div>
        </Panel>
      </section>
    </>
  );
}

function OrdersPage({
  data,
  search,
  status,
  onSearch,
  onStatus,
  onCreate,
  onOpen,
}: {
  data: OrdersData;
  search: string;
  status: 'all' | OrderStatus;
  onSearch: (value: string) => void;
  onStatus: (value: 'all' | OrderStatus) => void;
  onCreate: () => void;
  onOpen: (order: Order) => void;
}): ReactElement {
  const records = data.orders.filter(
    (order) =>
      (status === 'all' || order.status === status) &&
      (!search ||
        `${order.orderNo} ${order.customerName}`
          .toLowerCase()
          .includes(search.toLowerCase())),
  );
  return (
    <>
      <PageHeader
        eyebrow='ORDER MANAGEMENT'
        title='订单管理'
        description='管理订单明细、付款状态和履约进度，关键规则由服务端统一校验。'
        action={
          <PrimaryButton onClick={onCreate}>
            <Plus />
            新建订单
          </PrimaryButton>
        }
      />
      <div className='toolbar'>
        <label className='search-box'>
          <Search />
          <input
            onChange={(event) => onSearch(event.target.value)}
            placeholder='搜索订单号或客户'
            value={search}
          />
        </label>
        <select
          onChange={(event) =>
            onStatus(event.target.value as 'all' | OrderStatus)
          }
          value={status}
        >
          <option value='all'>全部状态</option>
          {Object.entries(statusCopy).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <Panel>
        <OrderTable orders={records} onOpen={onOpen} />
      </Panel>
    </>
  );
}

function CustomersPage({
  data,
  onCreate,
}: {
  data: OrdersData;
  onCreate: () => void;
}): ReactElement {
  return (
    <>
      <PageHeader
        eyebrow='CUSTOMER MASTER'
        title='客户档案'
        description='订单 App 自己维护的客户主数据，可在创建订单时直接选择。'
        action={
          <PrimaryButton onClick={onCreate}>
            <Plus />
            新建客户
          </PrimaryButton>
        }
      />
      <Panel>
        <div className='table-wrap'>
          <table>
            <thead>
              <tr>
                <th>客户名称</th>
                <th>联系人</th>
                <th>电话</th>
                <th>邮箱</th>
                <th>等级</th>
                <th>订单数</th>
              </tr>
            </thead>
            <tbody>
              {data.customers.map((customer) => (
                <tr key={customer.id}>
                  <td>
                    <strong>{customer.name}</strong>
                  </td>
                  <td>{customer.contactName}</td>
                  <td>{customer.phone}</td>
                  <td>{customer.email}</td>
                  <td>
                    <Badge
                      value={
                        customer.level === 'strategic'
                          ? '战略客户'
                          : customer.level === 'key'
                            ? '重点客户'
                            : '普通客户'
                      }
                      tone={
                        customer.level === 'strategic'
                          ? 'green'
                          : customer.level === 'key'
                            ? 'blue'
                            : 'gray'
                      }
                    />
                  </td>
                  <td>
                    {
                      data.orders.filter(
                        (order) => order.customerId === customer.id,
                      ).length
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}

function ProductsPage({
  data,
  onCreate,
}: {
  data: OrdersData;
  onCreate: () => void;
}): ReactElement {
  return (
    <>
      <PageHeader
        eyebrow='PRODUCT CATALOG'
        title='商品档案'
        description='维护商品、服务和可售库存，订单金额由服务端根据商品价格自动计算。'
        action={
          <PrimaryButton onClick={onCreate}>
            <Plus />
            新建商品
          </PrimaryButton>
        }
      />
      <Panel>
        <div className='table-wrap'>
          <table>
            <thead>
              <tr>
                <th>SKU</th>
                <th>商品名称</th>
                <th>分类</th>
                <th>单价</th>
                <th>库存</th>
                <th>状态</th>
              </tr>
            </thead>
            <tbody>
              {data.products.map((product) => (
                <tr key={product.id}>
                  <td className='muted'>{product.sku}</td>
                  <td>
                    <strong>{product.name}</strong>
                  </td>
                  <td>{product.category}</td>
                  <td>{money(product.price)}</td>
                  <td>{product.stock}</td>
                  <td>
                    <Badge
                      value={product.status === 'active' ? '可售' : '停用'}
                      tone={product.status === 'active' ? 'green' : 'gray'}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}

function OrderTable({
  orders,
  onOpen,
}: {
  orders: Order[];
  onOpen: (order: Order) => void;
}): ReactElement {
  if (!orders.length)
    return <div className='empty-state'>没有符合条件的订单</div>;
  return (
    <div className='table-wrap'>
      <table>
        <thead>
          <tr>
            <th>订单号</th>
            <th>客户</th>
            <th>金额</th>
            <th>订单状态</th>
            <th>付款状态</th>
            <th>下单时间</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <tr key={order.id}>
              <td>
                <button
                  className='record-link'
                  onClick={() => onOpen(order)}
                  type='button'
                >
                  {order.orderNo}
                </button>
              </td>
              <td>{order.customerName}</td>
              <td>
                <strong>{money(order.totalAmount)}</strong>
              </td>
              <td>
                <Badge
                  value={statusCopy[order.status]}
                  tone={statusTone(order.status)}
                />
              </td>
              <td>
                <Badge
                  value={paymentCopy[order.paymentStatus]}
                  tone={paymentTone(order.paymentStatus)}
                />
              </td>
              <td className='muted'>{dateTime(order.placedAt)}</td>
              <td>
                <button
                  className='secondary-button compact'
                  onClick={() => onOpen(order)}
                  type='button'
                >
                  查看
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OrderForm({
  data,
  busy,
  onSubmit,
}: {
  data: OrdersData;
  busy: boolean;
  onSubmit: (body: unknown) => void;
}): ReactElement {
  const [lines, setLines] = useState(() => [
    {
      id: crypto.randomUUID(),
      productId:
        data.products.find((item) => item.status === 'active')?.id ?? '',
      quantity: 1,
    },
  ]);
  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    onSubmit({
      customerId: form.get('customerId'),
      notes: form.get('notes'),
      lines: lines.map(({ id: _id, ...line }) => line),
    });
  };
  return (
    <form className='business-form' onSubmit={submit}>
      <label>
        客户
        <select name='customerId' required>
          {data.customers.map((customer) => (
            <option key={customer.id} value={customer.id}>
              {customer.name}
            </option>
          ))}
        </select>
      </label>
      <fieldset>
        <legend>订单商品</legend>
        {lines.map((line, index) => (
          <div className='line-editor' key={line.id}>
            <select
              aria-label='商品'
              onChange={(event) =>
                setLines((current) =>
                  current.map((item, itemIndex) =>
                    itemIndex === index
                      ? { ...item, productId: event.target.value }
                      : item,
                  ),
                )
              }
              value={line.productId}
            >
              {data.products
                .filter((product) => product.status === 'active')
                .map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name} · {money(product.price)}
                  </option>
                ))}
            </select>
            <input
              aria-label='数量'
              min='1'
              onChange={(event) =>
                setLines((current) =>
                  current.map((item, itemIndex) =>
                    itemIndex === index
                      ? { ...item, quantity: Number(event.target.value) }
                      : item,
                  ),
                )
              }
              type='number'
              value={line.quantity}
            />
            <button
              disabled={lines.length === 1}
              onClick={() =>
                setLines((current) =>
                  current.filter((item) => item.id !== line.id),
                )
              }
              type='button'
            >
              <X />
            </button>
          </div>
        ))}
        <button
          className='secondary-button compact'
          onClick={() =>
            setLines((current) => [
              ...current,
              {
                id: crypto.randomUUID(),
                productId: data.products[0]?.id ?? '',
                quantity: 1,
              },
            ])
          }
          type='button'
        >
          <Plus />
          添加商品
        </button>
      </fieldset>
      <label>
        订单备注
        <textarea name='notes' placeholder='交付要求、客户说明等' />
      </label>
      <button className='primary-button' disabled={busy} type='submit'>
        {busy ? '正在创建…' : '创建订单'}
      </button>
    </form>
  );
}

function CustomerForm({
  busy,
  onSubmit,
}: {
  busy: boolean;
  onSubmit: (body: unknown) => void;
}): ReactElement {
  return (
    <SimpleForm busy={busy} submitLabel='保存客户' onSubmit={onSubmit}>
      <label>
        客户名称
        <input name='name' required />
      </label>
      <label>
        联系人
        <input name='contactName' />
      </label>
      <label>
        电话
        <input name='phone' />
      </label>
      <label>
        邮箱
        <input name='email' type='email' />
      </label>
      <label>
        客户等级
        <select name='level'>
          <option value='standard'>普通客户</option>
          <option value='key'>重点客户</option>
          <option value='strategic'>战略客户</option>
        </select>
      </label>
    </SimpleForm>
  );
}
function ProductForm({
  busy,
  onSubmit,
}: {
  busy: boolean;
  onSubmit: (body: unknown) => void;
}): ReactElement {
  return (
    <SimpleForm busy={busy} submitLabel='保存商品' onSubmit={onSubmit}>
      <label>
        SKU
        <input name='sku' required />
      </label>
      <label>
        商品名称
        <input name='name' required />
      </label>
      <label>
        商品分类
        <input name='category' />
      </label>
      <label>
        销售单价
        <input min='0' name='price' required step='0.01' type='number' />
      </label>
      <label>
        可售库存
        <input min='0' name='stock' required type='number' />
      </label>
      <label>
        状态
        <select name='status'>
          <option value='active'>可售</option>
          <option value='inactive'>停用</option>
        </select>
      </label>
    </SimpleForm>
  );
}

function SimpleForm({
  busy,
  children,
  onSubmit,
  submitLabel,
}: {
  busy: boolean;
  children: ReactNode;
  onSubmit: (body: unknown) => void;
  submitLabel: string;
}): ReactElement {
  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    onSubmit(Object.fromEntries(new FormData(event.currentTarget)));
  };
  return (
    <form className='business-form two-column' onSubmit={submit}>
      {children}
      <button className='primary-button full' disabled={busy} type='submit'>
        {busy ? '正在保存…' : submitLabel}
      </button>
    </form>
  );
}

function OrderDetail({
  order,
  busy,
  onDelete,
  onTransition,
}: {
  order: Order;
  busy: boolean;
  onDelete: () => void;
  onTransition: (status: OrderStatus) => void;
}): ReactElement {
  return (
    <div className='detail-view'>
      <div className='detail-grid'>
        <Definition label='订单号' value={order.orderNo} />
        <Definition label='客户' value={order.customerName} />
        <Definition
          label='订单状态'
          value={
            <Badge
              value={statusCopy[order.status]}
              tone={statusTone(order.status)}
            />
          }
        />
        <Definition
          label='付款状态'
          value={
            <Badge
              value={paymentCopy[order.paymentStatus]}
              tone={paymentTone(order.paymentStatus)}
            />
          }
        />
        <Definition label='订单金额' value={money(order.totalAmount)} />
        <Definition label='下单时间' value={dateTime(order.placedAt)} />
      </div>
      <h3>商品明细</h3>
      <div className='table-wrap'>
        <table>
          <thead>
            <tr>
              <th>商品</th>
              <th>单价</th>
              <th>数量</th>
              <th>小计</th>
            </tr>
          </thead>
          <tbody>
            {order.lines.map((line) => (
              <tr key={line.productId}>
                <td>{line.productName}</td>
                <td>{money(line.unitPrice)}</td>
                <td>{line.quantity}</td>
                <td>
                  <strong>{money(line.subtotal)}</strong>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {order.notes ? (
        <div className='detail-note'>
          <strong>备注</strong>
          <p>{order.notes}</p>
        </div>
      ) : null}
      <div className='detail-actions'>
        {transitions[order.status].map(([next, label]) => (
          <button
            className={
              next === 'cancelled' ? 'danger-button' : 'primary-button'
            }
            disabled={busy}
            key={next}
            onClick={() => onTransition(next)}
            type='button'
          >
            {label}
          </button>
        ))}
        {order.status === 'draft' || order.status === 'cancelled' ? (
          <button
            className='danger-button'
            disabled={busy}
            onClick={onDelete}
            type='button'
          >
            删除订单
          </button>
        ) : null}
      </div>
    </div>
  );
}

function PageHeader({
  action,
  description,
  eyebrow,
  title,
}: {
  action?: ReactNode;
  description: string;
  eyebrow: string;
  title: string;
}): ReactElement {
  return (
    <header className='page-heading'>
      <div>
        <p>{eyebrow}</p>
        <h1>{title}</h1>
        <span>{description}</span>
      </div>
      {action}
    </header>
  );
}
function Metric({
  hint,
  icon,
  label,
  tone,
  value,
}: {
  hint: string;
  icon: ReactNode;
  label: string;
  tone: string;
  value: string;
}): ReactElement {
  return (
    <article className={`metric-card ${tone}`}>
      <div>
        <span>{label}</span>
        {icon}
      </div>
      <strong>{value}</strong>
      <small>{hint}</small>
    </article>
  );
}
function Panel({
  action,
  children,
  title,
}: {
  action?: ReactNode;
  children: ReactNode;
  title?: string;
}): ReactElement {
  return (
    <section className='business-panel'>
      {title ? (
        <header>
          <h2>{title}</h2>
          {action}
        </header>
      ) : null}
      {children}
    </section>
  );
}
function PrimaryButton({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
}): ReactElement {
  return (
    <button className='primary-button' onClick={onClick} type='button'>
      {children}
    </button>
  );
}
function Badge({ tone, value }: { tone: string; value: string }): ReactElement {
  return <span className={`business-badge ${tone}`}>{value}</span>;
}
function Definition({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}): ReactElement {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
function Dialog({
  children,
  onClose,
  title,
}: {
  children: ReactNode;
  onClose: () => void;
  title: string;
}): ReactElement {
  return (
    <>
      <button
        aria-label='关闭'
        className='dialog-backdrop'
        onClick={onClose}
        type='button'
      />
      <aside aria-modal='true' className='business-dialog' role='dialog'>
        <header>
          <h2>{title}</h2>
          <button onClick={onClose} type='button'>
            <X />
          </button>
        </header>
        <div>{children}</div>
      </aside>
    </>
  );
}
function LoadingState({
  busy,
  error,
  onRetry,
}: {
  busy: boolean;
  error: string | null;
  onRetry: () => void;
}): ReactElement {
  return (
    <div className='full-state'>
      {error ? (
        <AlertTriangle />
      ) : (
        <RefreshCw className={busy ? 'spin' : undefined} />
      )}
      <h2>{error ? '订单运营中心暂时无法加载' : '正在加载订单数据'}</h2>
      {error ? <p>{error}</p> : null}
      {error ? (
        <button className='primary-button' onClick={onRetry} type='button'>
          重新加载
        </button>
      ) : null}
    </div>
  );
}
function money(value: number): string {
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: 'CNY',
    maximumFractionDigits: 0,
  }).format(value);
}
function dateTime(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}
function statusTone(status: OrderStatus): string {
  return status === 'completed'
    ? 'green'
    : status === 'cancelled'
      ? 'red'
      : status === 'pending' || status === 'shipped'
        ? 'blue'
        : status === 'processing'
          ? 'orange'
          : 'gray';
}
function paymentTone(status: PaymentStatus): string {
  return status === 'paid'
    ? 'green'
    : status === 'refunded'
      ? 'red'
      : status === 'partial'
        ? 'orange'
        : 'gray';
}
