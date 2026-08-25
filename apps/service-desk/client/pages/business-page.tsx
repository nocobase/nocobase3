import { useAppClient } from '@nocobase/app-client';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  Headphones,
  MessageSquareText,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  TicketCheck,
  X,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactElement,
  type ReactNode,
} from 'react';
import { useLocation, useNavigate } from 'react-router';

type TicketStatus =
  'new' | 'assigned' | 'in_progress' | 'waiting' | 'resolved' | 'closed';
type TicketPriority = 'low' | 'normal' | 'high' | 'urgent';
interface Customer {
  id: string;
  company: string;
  contactName: string;
  phone: string;
  email: string;
  level: 'standard' | 'key' | 'strategic';
  createdAt: string;
}
interface Service {
  id: string;
  name: string;
  category: string;
  ownerTeam: string;
  slaMinutes: number;
  status: 'active' | 'inactive';
}
interface Agent {
  id: string;
  name: string;
  team: string;
  role: 'agent' | 'lead';
  status: 'online' | 'busy' | 'offline';
}
interface Activity {
  id: string;
  type: 'created' | 'assigned' | 'status' | 'reply' | 'updated';
  author: string;
  content: string;
  createdAt: string;
}
interface Ticket {
  id: string;
  ticketNo: string;
  title: string;
  description: string;
  customerId: string;
  customerName: string;
  serviceId: string;
  serviceName: string;
  priority: TicketPriority;
  status: TicketStatus;
  assigneeId: string | null;
  assigneeName: string | null;
  slaDueAt: string;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  activities: Activity[];
}
interface Dashboard {
  ticketCount: number;
  pendingCount: number;
  overdueCount: number;
  atRiskCount: number;
  resolvedCount: number;
  slaComplianceRate: number;
  statusCounts: Record<TicketStatus, number>;
  priorityCounts: Record<TicketPriority, number>;
}
interface ServiceDeskData {
  customers: Customer[];
  services: Service[];
  agents: Agent[];
  tickets: Ticket[];
  dashboard: Dashboard;
}

const statusCopy: Record<TicketStatus, string> = {
  new: '新建',
  assigned: '已分派',
  in_progress: '处理中',
  waiting: '待客户',
  resolved: '已解决',
  closed: '已关闭',
};
const priorityCopy: Record<TicketPriority, string> = {
  low: '低',
  normal: '普通',
  high: '高',
  urgent: '紧急',
};
const transitions: Record<TicketStatus, Array<[TicketStatus, string]>> = {
  new: [
    ['in_progress', '开始处理'],
    ['closed', '直接关闭'],
  ],
  assigned: [
    ['in_progress', '开始处理'],
    ['waiting', '等待客户'],
    ['resolved', '标记解决'],
  ],
  in_progress: [
    ['waiting', '等待客户'],
    ['resolved', '标记解决'],
  ],
  waiting: [
    ['in_progress', '继续处理'],
    ['resolved', '标记解决'],
  ],
  resolved: [
    ['in_progress', '重新打开'],
    ['closed', '关闭工单'],
  ],
  closed: [],
};

export default function BusinessPage(): ReactElement {
  const client = useAppClient();
  const location = useLocation();
  const navigate = useNavigate();
  const [data, setData] = useState<ServiceDeskData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'all' | TicketStatus>('all');
  const [priority, setPriority] = useState<'all' | TicketPriority>('all');
  const [dialog, setDialog] = useState<{
    type: 'ticket' | 'customer' | 'detail';
    ticket?: Ticket;
  } | null>(null);
  const load = useCallback(async () => {
    setBusy(true);
    try {
      const response = await client.request<{ data: ServiceDeskData }>(
        '/bootstrap',
      );
      setData(response.data);
      setError(null);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : '服务台数据加载失败',
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
        new CustomEvent('service-desk:toast', { detail: message }),
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
  const page = location.pathname.endsWith('/tickets')
    ? 'tickets'
    : location.pathname.endsWith('/customers')
      ? 'customers'
      : location.pathname.endsWith('/catalog')
        ? 'catalog'
        : location.pathname.endsWith('/team')
          ? 'team'
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
        <DashboardPage
          data={data}
          onCreate={() => setDialog({ type: 'ticket' })}
          onOpen={(ticket) => setDialog({ type: 'detail', ticket })}
          onViewAll={() => navigate('/tickets')}
        />
      ) : null}
      {page === 'tickets' ? (
        <TicketsPage
          data={data}
          priority={priority}
          search={search}
          status={status}
          onCreate={() => setDialog({ type: 'ticket' })}
          onOpen={(ticket) => setDialog({ type: 'detail', ticket })}
          onPriority={setPriority}
          onSearch={setSearch}
          onStatus={setStatus}
        />
      ) : null}
      {page === 'customers' ? (
        <CustomersPage
          data={data}
          onCreate={() => setDialog({ type: 'customer' })}
        />
      ) : null}
      {page === 'catalog' ? <CatalogPage services={data.services} /> : null}
      {page === 'team' ? <TeamPage data={data} /> : null}
      {dialog ? (
        <Dialog
          title={
            dialog.type === 'ticket'
              ? '新建工单'
              : dialog.type === 'customer'
                ? '新建客户'
                : '工单详情'
          }
          onClose={() => setDialog(null)}
        >
          {dialog.type === 'ticket' ? (
            <TicketForm
              data={data}
              busy={busy}
              onSubmit={(body) =>
                void mutate(
                  '/tickets',
                  { method: 'POST', body: JSON.stringify(body) },
                  '工单已创建',
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
          {dialog.type === 'detail' && dialog.ticket ? (
            <TicketDetail
              agents={data.agents}
              busy={busy}
              ticket={dialog.ticket}
              onAssign={(agentId) =>
                void mutate(
                  `/tickets/${dialog.ticket!.id}/assign`,
                  { method: 'POST', body: JSON.stringify({ agentId }) },
                  '工单已分派',
                )
              }
              onDelete={() =>
                void mutate(
                  `/tickets/${dialog.ticket!.id}`,
                  { method: 'DELETE' },
                  '工单已删除',
                )
              }
              onReply={(content) =>
                void mutate(
                  `/tickets/${dialog.ticket!.id}/replies`,
                  { method: 'POST', body: JSON.stringify({ content }) },
                  '回复已记录',
                )
              }
              onTransition={(next) =>
                void mutate(
                  `/tickets/${dialog.ticket!.id}/transition`,
                  { method: 'POST', body: JSON.stringify({ status: next }) },
                  '工单状态已更新',
                )
              }
            />
          ) : null}
        </Dialog>
      ) : null}
    </div>
  );
}

function DashboardPage({
  data,
  onCreate,
  onOpen,
  onViewAll,
}: {
  data: ServiceDeskData;
  onCreate: () => void;
  onOpen: (ticket: Ticket) => void;
  onViewAll: () => void;
}): ReactElement {
  const maximum = Math.max(...Object.values(data.dashboard.statusCounts), 1);
  const risks = [...data.tickets]
    .filter((ticket) => !['resolved', 'closed'].includes(ticket.status))
    .sort(
      (a, b) => new Date(a.slaDueAt).getTime() - new Date(b.slaDueAt).getTime(),
    )
    .slice(0, 5);
  return (
    <>
      <PageHeader
        eyebrow='SERVICE OPERATIONS'
        title='服务运营总览'
        description='集中查看待处理工单、SLA 风险和团队负载，快速进入今天最需要处理的事项。'
        action={
          <button className='primary-button' onClick={onCreate} type='button'>
            <Plus />
            新建工单
          </button>
        }
      />
      <div className='metric-grid five'>
        <Metric
          icon={<TicketCheck />}
          label='工单总数'
          tone='blue'
          value={data.dashboard.ticketCount}
          hint='全部服务请求'
        />
        <Metric
          icon={<Headphones />}
          label='待处理'
          tone='teal'
          value={data.dashboard.pendingCount}
          hint='需要团队跟进'
        />
        <Metric
          icon={<ShieldAlert />}
          label='已超时'
          tone='red'
          value={data.dashboard.overdueCount}
          hint='需要立即升级'
        />
        <Metric
          icon={<Clock3 />}
          label='即将超时'
          tone='orange'
          value={data.dashboard.atRiskCount}
          hint='4 小时内到期'
        />
        <Metric
          icon={<CheckCircle2 />}
          label='SLA 达标率'
          tone='green'
          value={`${data.dashboard.slaComplianceRate}%`}
          hint={`已解决 ${data.dashboard.resolvedCount} 单`}
        />
      </div>
      <div className='dashboard-grid'>
        <section className='business-panel'>
          <header>
            <h2>最近工单</h2>
            <button className='text-action' onClick={onViewAll} type='button'>
              查看全部
              <ArrowRight />
            </button>
          </header>
          <TicketTable tickets={data.tickets.slice(0, 6)} onOpen={onOpen} />
        </section>
        <div className='dashboard-stack'>
          <section className='business-panel'>
            <header>
              <h2>工单状态</h2>
              <span className='live-label'>
                <span />
                实时
              </span>
            </header>
            <div className='status-stack'>
              {Object.entries(data.dashboard.statusCounts).map(
                ([key, count]) => (
                  <div className='status-row' key={key}>
                    <span>{statusCopy[key as TicketStatus]}</span>
                    <div>
                      <i
                        style={{
                          width: `${Math.max((count / maximum) * 100, count ? 8 : 0)}%`,
                        }}
                      />
                    </div>
                    <strong>{count}</strong>
                  </div>
                ),
              )}
            </div>
          </section>
          <section className='business-panel'>
            <header>
              <h2>SLA 风险队列</h2>
              <small>按到期时间</small>
            </header>
            <div className='risk-list'>
              {risks.map((ticket) => (
                <button
                  key={ticket.id}
                  onClick={() => onOpen(ticket)}
                  type='button'
                >
                  <span>
                    {ticket.ticketNo} · {ticket.title}
                  </span>
                  <strong className={slaTone(ticket)}>
                    {slaLabel(ticket)}
                  </strong>
                </button>
              ))}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}

function TicketsPage({
  data,
  priority,
  search,
  status,
  onCreate,
  onOpen,
  onPriority,
  onSearch,
  onStatus,
}: {
  data: ServiceDeskData;
  priority: 'all' | TicketPriority;
  search: string;
  status: 'all' | TicketStatus;
  onCreate: () => void;
  onOpen: (ticket: Ticket) => void;
  onPriority: (value: 'all' | TicketPriority) => void;
  onSearch: (value: string) => void;
  onStatus: (value: 'all' | TicketStatus) => void;
}): ReactElement {
  const tickets = useMemo(() => {
    const query = search.trim().toLowerCase();
    return data.tickets.filter(
      (ticket) =>
        (status === 'all' || ticket.status === status) &&
        (priority === 'all' || ticket.priority === priority) &&
        (!query ||
          `${ticket.ticketNo} ${ticket.title} ${ticket.customerName}`
            .toLowerCase()
            .includes(query)),
    );
  }, [data.tickets, priority, search, status]);
  return (
    <>
      <PageHeader
        eyebrow='TICKETS'
        title='工单管理'
        description='受理、分派并跟踪客户问题。状态、SLA 和每次处理记录都会保存到服务端。'
        action={
          <button className='primary-button' onClick={onCreate} type='button'>
            <Plus />
            新建工单
          </button>
        }
      />
      <div className='toolbar'>
        <label className='search-box'>
          <Search />
          <input
            onChange={(event) => onSearch(event.target.value)}
            placeholder='搜索工单号、标题或客户'
            value={search}
          />
        </label>
        <select
          onChange={(event) =>
            onPriority(event.target.value as 'all' | TicketPriority)
          }
          value={priority}
        >
          <option value='all'>全部优先级</option>
          {Object.entries(priorityCopy).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select
          onChange={(event) =>
            onStatus(event.target.value as 'all' | TicketStatus)
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
      <section className='business-panel'>
        <TicketTable tickets={tickets} onOpen={onOpen} />
      </section>
    </>
  );
}

function CustomersPage({
  data,
  onCreate,
}: {
  data: ServiceDeskData;
  onCreate: () => void;
}): ReactElement {
  return (
    <>
      <PageHeader
        eyebrow='CUSTOMERS'
        title='客户联系人'
        description='服务台维护的客户和联系人，可直接关联到新工单。'
        action={
          <button className='primary-button' onClick={onCreate} type='button'>
            <Plus />
            新建客户
          </button>
        }
      />
      <section className='business-panel'>
        <div className='table-wrap'>
          <table>
            <thead>
              <tr>
                <th>客户</th>
                <th>联系人</th>
                <th>电话</th>
                <th>邮箱</th>
                <th>等级</th>
                <th>工单数</th>
                <th>未结工单</th>
              </tr>
            </thead>
            <tbody>
              {data.customers.map((customer) => {
                const tickets = data.tickets.filter(
                  (ticket) => ticket.customerId === customer.id,
                );
                return (
                  <tr key={customer.id}>
                    <td>
                      <strong>{customer.company}</strong>
                    </td>
                    <td>{customer.contactName}</td>
                    <td>{customer.phone || '—'}</td>
                    <td>{customer.email || '—'}</td>
                    <td>
                      <Badge
                        tone={
                          customer.level === 'strategic'
                            ? 'purple'
                            : customer.level === 'key'
                              ? 'blue'
                              : 'gray'
                        }
                      >
                        {customer.level === 'strategic'
                          ? '战略客户'
                          : customer.level === 'key'
                            ? '重点客户'
                            : '标准客户'}
                      </Badge>
                    </td>
                    <td>{tickets.length}</td>
                    <td>
                      {
                        tickets.filter(
                          (ticket) =>
                            !['resolved', 'closed'].includes(ticket.status),
                        ).length
                      }
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function CatalogPage({ services }: { services: Service[] }): ReactElement {
  return (
    <>
      <PageHeader
        eyebrow='SERVICE CATALOG'
        title='服务目录'
        description='统一定义服务分类、负责团队和基础 SLA；新建工单会据此计算到期时间。'
      />
      <div className='card-grid'>
        {services.map((service) => (
          <article className='catalog-card' key={service.id}>
            <header>
              <div>
                <h3>{service.name}</h3>
                <p>{service.category}</p>
              </div>
              <Badge tone={service.status === 'active' ? 'green' : 'gray'}>
                {service.status === 'active' ? '已启用' : '已停用'}
              </Badge>
            </header>
            <footer>
              <span>{service.ownerTeam}</span>
              <strong>基础 SLA {duration(service.slaMinutes)}</strong>
            </footer>
          </article>
        ))}
      </div>
    </>
  );
}

function TeamPage({ data }: { data: ServiceDeskData }): ReactElement {
  return (
    <>
      <PageHeader
        eyebrow='SUPPORT TEAM'
        title='客服团队'
        description='查看客服在线状态和当前未结工单，分派操作会由服务端校验人员状态。'
      />
      <div className='card-grid'>
        {data.agents.map((agent) => {
          const count = data.tickets.filter(
            (ticket) =>
              ticket.assigneeId === agent.id &&
              !['resolved', 'closed'].includes(ticket.status),
          ).length;
          return (
            <article className='agent-card' key={agent.id}>
              <header>
                <span className='agent-avatar'>{agent.name.slice(-1)}</span>
                <div>
                  <h3>{agent.name}</h3>
                  <p>
                    {agent.team} · {agent.role === 'lead' ? '组长' : '客服'}
                  </p>
                </div>
                <Badge
                  tone={
                    agent.status === 'online'
                      ? 'green'
                      : agent.status === 'busy'
                        ? 'orange'
                        : 'gray'
                  }
                >
                  {agent.status === 'online'
                    ? '在线'
                    : agent.status === 'busy'
                      ? '忙碌'
                      : '离线'}
                </Badge>
              </header>
              <footer>
                <strong>{count}</strong> 个未结工单
              </footer>
            </article>
          );
        })}
      </div>
    </>
  );
}

function TicketTable({
  tickets,
  onOpen,
}: {
  tickets: Ticket[];
  onOpen: (ticket: Ticket) => void;
}): ReactElement {
  if (!tickets.length)
    return <div className='empty-state'>没有符合条件的工单</div>;
  return (
    <div className='table-wrap'>
      <table>
        <thead>
          <tr>
            <th>工单</th>
            <th>客户</th>
            <th>优先级</th>
            <th>状态</th>
            <th>负责人</th>
            <th>SLA</th>
            <th>更新时间</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {tickets.map((ticket) => (
            <tr key={ticket.id}>
              <td>
                <button
                  className='record-link stacked'
                  onClick={() => onOpen(ticket)}
                  type='button'
                >
                  <strong>{ticket.title}</strong>
                  <span>
                    {ticket.ticketNo} · {ticket.serviceName}
                  </span>
                </button>
              </td>
              <td>{ticket.customerName}</td>
              <td>
                <PriorityBadge value={ticket.priority} />
              </td>
              <td>
                <StatusBadge value={ticket.status} />
              </td>
              <td>{ticket.assigneeName ?? '待分派'}</td>
              <td className={slaTone(ticket)}>{slaLabel(ticket)}</td>
              <td className='muted'>{dateTime(ticket.updatedAt)}</td>
              <td>
                <button
                  className='secondary-button compact'
                  onClick={() => onOpen(ticket)}
                  type='button'
                >
                  处理
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TicketForm({
  data,
  busy,
  onSubmit,
}: {
  data: ServiceDeskData;
  busy: boolean;
  onSubmit: (body: Record<string, unknown>) => void;
}): ReactElement {
  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    onSubmit(Object.fromEntries(form));
  };
  return (
    <form className='business-form two-column' onSubmit={submit}>
      <label className='full'>
        工单标题
        <input maxLength={180} name='title' required />
      </label>
      <label>
        客户
        <select name='customerId' required>
          {data.customers.map((customer) => (
            <option key={customer.id} value={customer.id}>
              {customer.company}
            </option>
          ))}
        </select>
      </label>
      <label>
        服务项目
        <select name='serviceId' required>
          {data.services
            .filter((service) => service.status === 'active')
            .map((service) => (
              <option key={service.id} value={service.id}>
                {service.name}
              </option>
            ))}
        </select>
      </label>
      <label>
        优先级
        <select defaultValue='normal' name='priority'>
          {Object.entries(priorityCopy).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className='full'>
        问题描述
        <textarea maxLength={3000} name='description' />
      </label>
      <button className='primary-button full' disabled={busy} type='submit'>
        {busy ? '正在创建…' : '创建工单'}
      </button>
    </form>
  );
}

function CustomerForm({
  busy,
  onSubmit,
}: {
  busy: boolean;
  onSubmit: (body: Record<string, unknown>) => void;
}): ReactElement {
  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    onSubmit(Object.fromEntries(new FormData(event.currentTarget)));
  };
  return (
    <form className='business-form two-column' onSubmit={submit}>
      <label className='full'>
        客户名称
        <input maxLength={160} name='company' required />
      </label>
      <label>
        联系人
        <input maxLength={120} name='contactName' required />
      </label>
      <label>
        客户等级
        <select defaultValue='standard' name='level'>
          <option value='standard'>标准客户</option>
          <option value='key'>重点客户</option>
          <option value='strategic'>战略客户</option>
        </select>
      </label>
      <label>
        电话
        <input maxLength={64} name='phone' />
      </label>
      <label>
        邮箱
        <input maxLength={320} name='email' type='email' />
      </label>
      <button className='primary-button full' disabled={busy} type='submit'>
        {busy ? '正在保存…' : '保存客户'}
      </button>
    </form>
  );
}

function TicketDetail({
  agents,
  busy,
  ticket,
  onAssign,
  onDelete,
  onReply,
  onTransition,
}: {
  agents: Agent[];
  busy: boolean;
  ticket: Ticket;
  onAssign: (agentId: string) => void;
  onDelete: () => void;
  onReply: (content: string) => void;
  onTransition: (status: TicketStatus) => void;
}): ReactElement {
  const [agentId, setAgentId] = useState(
    ticket.assigneeId ??
      agents.find((agent) => agent.status !== 'offline')?.id ??
      '',
  );
  const [reply, setReply] = useState('');
  return (
    <div className='detail-view'>
      <div className='detail-title'>
        <div>
          <span>{ticket.ticketNo}</span>
          <h3>{ticket.title}</h3>
        </div>
        <div>
          <PriorityBadge value={ticket.priority} />
          <StatusBadge value={ticket.status} />
        </div>
      </div>
      <div className='detail-grid'>
        <Definition label='客户' value={ticket.customerName} />
        <Definition label='服务项目' value={ticket.serviceName} />
        <Definition label='负责人' value={ticket.assigneeName ?? '待分派'} />
        <Definition
          label='SLA 到期'
          value={`${dateTime(ticket.slaDueAt)} · ${slaLabel(ticket)}`}
        />
      </div>
      <div className='detail-note'>
        <strong>问题描述</strong>
        <p>{ticket.description || '暂无描述'}</p>
      </div>
      {ticket.status !== 'closed' ? (
        <>
          <h3>分派客服</h3>
          <div className='inline-form'>
            <select
              onChange={(event) => setAgentId(event.target.value)}
              value={agentId}
            >
              {agents.map((agent) => (
                <option
                  disabled={agent.status === 'offline'}
                  key={agent.id}
                  value={agent.id}
                >
                  {agent.name} · {agent.team} ·{' '}
                  {agent.status === 'offline'
                    ? '离线'
                    : agent.status === 'busy'
                      ? '忙碌'
                      : '在线'}
                </option>
              ))}
            </select>
            <button
              className='secondary-button'
              disabled={busy || !agentId}
              onClick={() => onAssign(agentId)}
              type='button'
            >
              确认分派
            </button>
          </div>
          <h3>内部回复</h3>
          <div className='reply-box'>
            <textarea
              onChange={(event) => setReply(event.target.value)}
              placeholder='记录处理结论或给客户的回复…'
              value={reply}
            />
            <button
              className='primary-button'
              disabled={busy || !reply.trim()}
              onClick={() => onReply(reply)}
              type='button'
            >
              <MessageSquareText />
              添加回复
            </button>
          </div>
        </>
      ) : null}
      <h3>活动时间线</h3>
      <div className='timeline'>
        {ticket.activities.map((activity) => (
          <article key={activity.id}>
            <span />
            <div>
              <header>
                <strong>{activity.author}</strong>
                <time>{dateTime(activity.createdAt)}</time>
              </header>
              <p>{activity.content}</p>
            </div>
          </article>
        ))}
      </div>
      <div className='detail-actions'>
        {transitions[ticket.status].map(([next, label]) => (
          <button
            className='primary-button'
            disabled={busy}
            key={next}
            onClick={() => onTransition(next)}
            type='button'
          >
            {label}
          </button>
        ))}
        {ticket.status === 'new' || ticket.status === 'closed' ? (
          <button
            className='danger-button'
            disabled={busy}
            onClick={onDelete}
            type='button'
          >
            删除工单
          </button>
        ) : null}
      </div>
    </div>
  );
}

function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}): ReactElement {
  return (
    <div className='page-heading'>
      <div>
        <p>{eyebrow}</p>
        <h1>{title}</h1>
        <span>{description}</span>
      </div>
      {action}
    </div>
  );
}
function Metric({
  icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  hint: string;
  tone: string;
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
function Badge({
  children,
  tone,
}: {
  children: ReactNode;
  tone: string;
}): ReactElement {
  return <span className={`business-badge ${tone}`}>{children}</span>;
}
function StatusBadge({ value }: { value: TicketStatus }): ReactElement {
  return (
    <Badge
      tone={
        value === 'resolved'
          ? 'green'
          : value === 'closed' || value === 'waiting'
            ? 'gray'
            : value === 'in_progress'
              ? 'orange'
              : value === 'assigned'
                ? 'purple'
                : 'blue'
      }
    >
      {statusCopy[value]}
    </Badge>
  );
}
function PriorityBadge({ value }: { value: TicketPriority }): ReactElement {
  return (
    <Badge
      tone={
        value === 'urgent'
          ? 'red'
          : value === 'high'
            ? 'orange'
            : value === 'normal'
              ? 'blue'
              : 'gray'
      }
    >
      {priorityCopy[value]}
    </Badge>
  );
}
function Definition({
  label,
  value,
}: {
  label: string;
  value: string;
}): ReactElement {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
function Dialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
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
          <button aria-label='关闭' onClick={onClose} type='button'>
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
      {error ? <AlertTriangle /> : <RefreshCw className={busy ? 'spin' : ''} />}
      <h2>{error ? '客户服务中心暂时无法加载' : '正在载入客户服务中心'}</h2>
      {error ? (
        <>
          <p>{error}</p>
          <button className='secondary-button' onClick={onRetry} type='button'>
            重新加载
          </button>
        </>
      ) : null}
    </div>
  );
}
function dateTime(value: string): string {
  return new Date(value).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
function duration(minutes: number): string {
  return minutes >= 1440
    ? `${minutes / 1440} 天`
    : minutes >= 60
      ? `${minutes / 60} 小时`
      : `${minutes} 分钟`;
}
function slaLabel(ticket: Ticket): string {
  if (ticket.status === 'resolved' || ticket.status === 'closed')
    return ticket.resolvedAt &&
      new Date(ticket.resolvedAt) <= new Date(ticket.slaDueAt)
      ? '按时完成'
      : '超时完成';
  const difference = new Date(ticket.slaDueAt).getTime() - Date.now();
  if (difference < 0) return `超时 ${relativeDuration(-difference)}`;
  return `剩余 ${relativeDuration(difference)}`;
}
function slaTone(ticket: Ticket): string {
  const difference = new Date(ticket.slaDueAt).getTime() - Date.now();
  if (ticket.status === 'resolved' || ticket.status === 'closed')
    return 'sla-ok';
  return difference < 0
    ? 'sla-overdue'
    : difference <= 4 * 60 * 60 * 1000
      ? 'sla-risk'
      : 'sla-ok';
}
function relativeDuration(milliseconds: number): string {
  const minutes = Math.max(1, Math.round(milliseconds / 60000));
  return minutes >= 1440
    ? `${Math.round(minutes / 1440)} 天`
    : minutes >= 60
      ? `${Math.round(minutes / 60)} 小时`
      : `${minutes} 分钟`;
}
