import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

export type TicketStatus =
  'new' | 'assigned' | 'in_progress' | 'waiting' | 'resolved' | 'closed';

export type TicketPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface Customer {
  id: string;
  company: string;
  contactName: string;
  phone: string;
  email: string;
  level: 'standard' | 'key' | 'strategic';
  createdAt: string;
}

export interface ServiceCatalogItem {
  id: string;
  name: string;
  category: string;
  ownerTeam: string;
  slaMinutes: number;
  status: 'active' | 'inactive';
}

export interface SupportAgent {
  id: string;
  name: string;
  team: string;
  role: 'agent' | 'lead';
  status: 'online' | 'busy' | 'offline';
}

export interface TicketActivity {
  id: string;
  type: 'created' | 'assigned' | 'status' | 'reply' | 'updated';
  author: string;
  content: string;
  createdAt: string;
}

export interface Ticket {
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
  activities: TicketActivity[];
}

export interface ServiceDeskState {
  schemaVersion: 1;
  nextTicketSequence: number;
  nextCustomerSequence: number;
  nextActivitySequence: number;
  customers: Customer[];
  services: ServiceCatalogItem[];
  agents: SupportAgent[];
  tickets: Ticket[];
}

export interface TicketDraft {
  title: string;
  description?: string;
  customerId: string;
  serviceId: string;
  priority: TicketPriority;
}

export interface ServiceDeskDashboard {
  ticketCount: number;
  pendingCount: number;
  overdueCount: number;
  atRiskCount: number;
  resolvedCount: number;
  slaComplianceRate: number;
  statusCounts: Record<TicketStatus, number>;
  priorityCounts: Record<TicketPriority, number>;
}

const allowedTransitions: Record<TicketStatus, TicketStatus[]> = {
  new: ['assigned', 'in_progress', 'closed'],
  assigned: ['in_progress', 'waiting', 'resolved'],
  in_progress: ['waiting', 'resolved'],
  waiting: ['in_progress', 'resolved'],
  resolved: ['in_progress', 'closed'],
  closed: [],
};

const slaMultipliers: Record<TicketPriority, number> = {
  low: 2,
  normal: 1,
  high: 0.5,
  urgent: 0.25,
};

export class ServiceDeskStoreError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, options: { status: number; code: string }) {
    super(message);
    this.name = 'ServiceDeskStoreError';
    this.status = options.status;
    this.code = options.code;
  }
}

export class ServiceDeskStore {
  private state: ServiceDeskState | undefined;
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

  async snapshot(): Promise<ServiceDeskState> {
    await this.ready();
    return structuredClone(this.requireState());
  }

  async dashboard(now: Date = new Date()): Promise<ServiceDeskDashboard> {
    const state = await this.snapshot();
    const statusCounts: Record<TicketStatus, number> = {
      new: 0,
      assigned: 0,
      in_progress: 0,
      waiting: 0,
      resolved: 0,
      closed: 0,
    };
    const priorityCounts: Record<TicketPriority, number> = {
      low: 0,
      normal: 0,
      high: 0,
      urgent: 0,
    };
    let overdueCount = 0;
    let atRiskCount = 0;
    let resolvedWithinSla = 0;
    let resolvedCount = 0;
    const nowTime = now.getTime();

    for (const ticket of state.tickets) {
      statusCounts[ticket.status] += 1;
      priorityCounts[ticket.priority] += 1;
      const terminal =
        ticket.status === 'resolved' || ticket.status === 'closed';
      const dueTime = new Date(ticket.slaDueAt).getTime();
      if (terminal) {
        resolvedCount += 1;
        if (
          ticket.resolvedAt &&
          new Date(ticket.resolvedAt).getTime() <= dueTime
        ) {
          resolvedWithinSla += 1;
        }
      } else if (dueTime < nowTime) {
        overdueCount += 1;
      } else if (dueTime - nowTime <= 4 * 60 * 60 * 1000) {
        atRiskCount += 1;
      }
    }

    return {
      ticketCount: state.tickets.length,
      pendingCount:
        statusCounts.new +
        statusCounts.assigned +
        statusCounts.in_progress +
        statusCounts.waiting,
      overdueCount,
      atRiskCount,
      resolvedCount,
      slaComplianceRate: resolvedCount
        ? Math.round((resolvedWithinSla / resolvedCount) * 100)
        : 100,
      statusCounts,
      priorityCounts,
    };
  }

  async createTicket(draft: TicketDraft): Promise<Ticket> {
    return this.mutate((state) => {
      const customer = requireCustomer(state, draft.customerId);
      const service = requireService(state, draft.serviceId);
      const priority = requirePriority(draft.priority);
      const now = new Date();
      const ticketNumber = state.nextTicketSequence;
      const ticket: Ticket = {
        id: `tkt_${String(ticketNumber).padStart(6, '0')}`,
        ticketNo: `SD-${now.getUTCFullYear()}-${String(ticketNumber).padStart(5, '0')}`,
        title: requireText(draft.title, '工单标题', 180),
        description: normalizeText(draft.description, 3000),
        customerId: customer.id,
        customerName: customer.company,
        serviceId: service.id,
        serviceName: service.name,
        priority,
        status: 'new',
        assigneeId: null,
        assigneeName: null,
        slaDueAt: calculateSlaDueAt(now, service.slaMinutes, priority),
        resolvedAt: null,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        activities: [],
      };
      ticket.activities.push(
        activity(state, 'created', '系统', '工单已创建', ticket.createdAt),
      );
      state.nextTicketSequence += 1;
      state.tickets.unshift(ticket);
      return ticket;
    });
  }

  async updateTicket(id: string, input: Partial<TicketDraft>): Promise<Ticket> {
    return this.mutate((state) => {
      const ticket = requireTicket(state, id);
      ensureEditable(ticket);
      if (input.title !== undefined) {
        ticket.title = requireText(input.title, '工单标题', 180);
      }
      if (input.description !== undefined) {
        ticket.description = normalizeText(input.description, 3000);
      }
      if (input.customerId !== undefined) {
        const customer = requireCustomer(state, input.customerId);
        ticket.customerId = customer.id;
        ticket.customerName = customer.company;
      }
      let shouldRecalculateSla = false;
      if (input.serviceId !== undefined) {
        const service = requireService(state, input.serviceId);
        ticket.serviceId = service.id;
        ticket.serviceName = service.name;
        shouldRecalculateSla = true;
      }
      if (input.priority !== undefined) {
        ticket.priority = requirePriority(input.priority);
        shouldRecalculateSla = true;
      }
      if (shouldRecalculateSla && !ticket.resolvedAt) {
        const service = requireService(state, ticket.serviceId);
        ticket.slaDueAt = calculateSlaDueAt(
          new Date(ticket.createdAt),
          service.slaMinutes,
          ticket.priority,
        );
      }
      ticket.updatedAt = new Date().toISOString();
      ticket.activities.unshift(
        activity(state, 'updated', '服务台管理员', '更新了工单信息'),
      );
      return ticket;
    });
  }

  async assignTicket(id: string, agentId: string): Promise<Ticket> {
    return this.mutate((state) => {
      const ticket = requireTicket(state, id);
      ensureEditable(ticket);
      const agent = state.agents.find((item) => item.id === agentId);
      if (!agent || agent.status === 'offline') {
        throw notFound('可用客服');
      }
      ticket.assigneeId = agent.id;
      ticket.assigneeName = agent.name;
      if (ticket.status === 'new') ticket.status = 'assigned';
      ticket.updatedAt = new Date().toISOString();
      ticket.activities.unshift(
        activity(state, 'assigned', '服务台管理员', `分派给 ${agent.name}`),
      );
      return ticket;
    });
  }

  async transitionTicket(
    id: string,
    nextStatus: TicketStatus,
  ): Promise<Ticket> {
    return this.mutate((state) => {
      const ticket = requireTicket(state, id);
      if (!allowedTransitions[ticket.status].includes(nextStatus)) {
        throw new ServiceDeskStoreError(
          `工单不能从 ${ticket.status} 直接变更为 ${nextStatus}`,
          { status: 409, code: 'INVALID_TICKET_TRANSITION' },
        );
      }
      if (nextStatus === 'assigned' && !ticket.assigneeId) {
        throw new ServiceDeskStoreError('请先选择负责人', {
          status: 409,
          code: 'ASSIGNEE_REQUIRED',
        });
      }
      const previousStatus = ticket.status;
      ticket.status = nextStatus;
      const now = new Date().toISOString();
      ticket.updatedAt = now;
      if (nextStatus === 'resolved') ticket.resolvedAt = now;
      if (nextStatus === 'in_progress' && previousStatus === 'resolved') {
        ticket.resolvedAt = null;
      }
      ticket.activities.unshift(
        activity(
          state,
          'status',
          ticket.assigneeName ?? '服务台管理员',
          `状态由 ${previousStatus} 变更为 ${nextStatus}`,
          now,
        ),
      );
      return ticket;
    });
  }

  async addReply(id: string, content: string): Promise<Ticket> {
    return this.mutate((state) => {
      const ticket = requireTicket(state, id);
      ensureEditable(ticket);
      ticket.activities.unshift(
        activity(
          state,
          'reply',
          ticket.assigneeName ?? '服务台管理员',
          requireText(content, '回复内容', 2000),
        ),
      );
      if (ticket.status === 'waiting') ticket.status = 'in_progress';
      ticket.updatedAt = new Date().toISOString();
      return ticket;
    });
  }

  async deleteTicket(id: string): Promise<void> {
    await this.mutate((state) => {
      const index = state.tickets.findIndex((item) => item.id === id);
      if (index < 0) throw notFound('工单');
      const ticket = state.tickets[index];
      if (ticket.status !== 'new' && ticket.status !== 'closed') {
        throw new ServiceDeskStoreError('只能删除新建或已关闭的工单', {
          status: 409,
          code: 'TICKET_DELETE_BLOCKED',
        });
      }
      state.tickets.splice(index, 1);
    });
  }

  async createCustomer(
    input: Omit<Customer, 'id' | 'createdAt'>,
  ): Promise<Customer> {
    return this.mutate((state) => {
      const company = requireText(input.company, '客户名称', 160);
      if (state.customers.some((customer) => customer.company === company)) {
        throw new ServiceDeskStoreError('客户名称已存在', {
          status: 409,
          code: 'CUSTOMER_EXISTS',
        });
      }
      const customer: Customer = {
        id: `cus_${String(state.nextCustomerSequence).padStart(4, '0')}`,
        company,
        contactName: requireText(input.contactName, '联系人', 120),
        phone: normalizeText(input.phone, 64),
        email: normalizeText(input.email, 320),
        level: requireCustomerLevel(input.level),
        createdAt: new Date().toISOString(),
      };
      state.nextCustomerSequence += 1;
      state.customers.unshift(customer);
      return customer;
    });
  }

  private async mutate<T>(
    operation: (state: ServiceDeskState) => T,
  ): Promise<T> {
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

  private requireState(): ServiceDeskState {
    if (!this.state) throw new Error('Service desk store is not initialized');
    return this.state;
  }
}

function requireTicket(state: ServiceDeskState, id: string): Ticket {
  const ticket = state.tickets.find((item) => item.id === id);
  if (!ticket) throw notFound('工单');
  return ticket;
}

function requireCustomer(state: ServiceDeskState, id: string): Customer {
  const customer = state.customers.find((item) => item.id === id);
  if (!customer) throw notFound('客户');
  return customer;
}

function requireService(
  state: ServiceDeskState,
  id: string,
): ServiceCatalogItem {
  const service = state.services.find(
    (item) => item.id === id && item.status === 'active',
  );
  if (!service) throw notFound('可用服务');
  return service;
}

function ensureEditable(ticket: Ticket): void {
  if (ticket.status === 'closed') {
    throw new ServiceDeskStoreError('已关闭工单不能修改', {
      status: 409,
      code: 'TICKET_CLOSED',
    });
  }
}

function activity(
  state: ServiceDeskState,
  type: TicketActivity['type'],
  author: string,
  content: string,
  createdAt: string = new Date().toISOString(),
): TicketActivity {
  const result: TicketActivity = {
    id: `act_${String(state.nextActivitySequence).padStart(7, '0')}`,
    type,
    author,
    content,
    createdAt,
  };
  state.nextActivitySequence += 1;
  return result;
}

function calculateSlaDueAt(
  start: Date,
  serviceMinutes: number,
  priority: TicketPriority,
): string {
  const duration = Math.max(
    30,
    Math.round(serviceMinutes * slaMultipliers[priority]),
  );
  return new Date(start.getTime() + duration * 60 * 1000).toISOString();
}

function requireText(value: unknown, label: string, maxLength: number): string {
  const normalized = normalizeText(value, maxLength);
  if (!normalized) {
    throw new ServiceDeskStoreError(`${label}不能为空`, {
      status: 400,
      code: 'VALIDATION_ERROR',
    });
  }
  return normalized;
}

function normalizeText(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function requirePriority(value: unknown): TicketPriority {
  if (
    value === 'low' ||
    value === 'normal' ||
    value === 'high' ||
    value === 'urgent'
  ) {
    return value;
  }
  throw new ServiceDeskStoreError('优先级无效', {
    status: 400,
    code: 'VALIDATION_ERROR',
  });
}

function requireCustomerLevel(value: unknown): Customer['level'] {
  if (value === 'key' || value === 'strategic') return value;
  return 'standard';
}

function notFound(label: string): ServiceDeskStoreError {
  return new ServiceDeskStoreError(`${label}不存在`, {
    status: 404,
    code: 'NOT_FOUND',
  });
}

function parseState(content: string): ServiceDeskState {
  const value = JSON.parse(content) as ServiceDeskState;
  if (
    value?.schemaVersion !== 1 ||
    !Array.isArray(value.tickets) ||
    !Array.isArray(value.customers) ||
    !Array.isArray(value.services) ||
    !Array.isArray(value.agents)
  ) {
    throw new Error('Service desk data file uses an unsupported schema');
  }
  return value;
}

export function createSeedState(): ServiceDeskState {
  const now = Date.now();
  const isoAgo = (minutes: number): string =>
    new Date(now - minutes * 60 * 1000).toISOString();
  const isoAfter = (minutes: number): string =>
    new Date(now + minutes * 60 * 1000).toISOString();
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
  ].map(([id, company, contactName, phone, email, level]) => ({
    id,
    company,
    contactName,
    phone,
    email,
    level: level as Customer['level'],
    createdAt: isoAgo(60 * 24 * 30),
  }));
  const services: ServiceCatalogItem[] = [
    {
      id: 'svc_001',
      name: '账号与权限',
      category: '平台服务',
      ownerTeam: '平台支持组',
      slaMinutes: 480,
      status: 'active',
    },
    {
      id: 'svc_002',
      name: '应用运行异常',
      category: '技术支持',
      ownerTeam: '应用保障组',
      slaMinutes: 240,
      status: 'active',
    },
    {
      id: 'svc_003',
      name: '数据与集成',
      category: '技术支持',
      ownerTeam: '集成支持组',
      slaMinutes: 720,
      status: 'active',
    },
    {
      id: 'svc_004',
      name: '产品使用咨询',
      category: '客户成功',
      ownerTeam: '客户成功组',
      slaMinutes: 1440,
      status: 'active',
    },
  ];
  const agents: SupportAgent[] = [
    {
      id: 'agt_001',
      name: '林清',
      team: '平台支持组',
      role: 'lead',
      status: 'online',
    },
    {
      id: 'agt_002',
      name: '赵一凡',
      team: '应用保障组',
      role: 'agent',
      status: 'busy',
    },
    {
      id: 'agt_003',
      name: '沈悦',
      team: '集成支持组',
      role: 'agent',
      status: 'online',
    },
    {
      id: 'agt_004',
      name: '唐宁',
      team: '客户成功组',
      role: 'agent',
      status: 'online',
    },
  ];
  const specs: Array<{
    customerId: string;
    serviceId: string;
    title: string;
    description: string;
    priority: TicketPriority;
    status: TicketStatus;
    assigneeId: string | null;
    createdAgo: number;
    dueAfter: number;
  }> = [
    {
      customerId: 'cus_0001',
      serviceId: 'svc_002',
      title: '生产应用间歇性出现 502',
      description: '上午高峰期出现三次 502，需要协助排查运行日志。',
      priority: 'urgent',
      status: 'in_progress',
      assigneeId: 'agt_002',
      createdAgo: 95,
      dueAfter: 25,
    },
    {
      customerId: 'cus_0002',
      serviceId: 'svc_001',
      title: '新员工无法进入订单应用',
      description: '已加入销售运营角色，仍提示无权访问。',
      priority: 'high',
      status: 'assigned',
      assigneeId: 'agt_001',
      createdAgo: 180,
      dueAfter: 60,
    },
    {
      customerId: 'cus_0003',
      serviceId: 'svc_003',
      title: 'Webhook 回调重复入库',
      description: '第三方回调偶发重复，希望确认幂等策略。',
      priority: 'high',
      status: 'waiting',
      assigneeId: 'agt_003',
      createdAgo: 520,
      dueAfter: -40,
    },
    {
      customerId: 'cus_0004',
      serviceId: 'svc_004',
      title: '如何配置文件存储',
      description: '准备接入 S3，希望了解配置和迁移方式。',
      priority: 'normal',
      status: 'new',
      assigneeId: null,
      createdAgo: 45,
      dueAfter: 1395,
    },
    {
      customerId: 'cus_0001',
      serviceId: 'svc_001',
      title: '审批人范围配置问题',
      description: '已协助调整角色数据范围。',
      priority: 'normal',
      status: 'resolved',
      assigneeId: 'agt_001',
      createdAgo: 360,
      dueAfter: 120,
    },
    {
      customerId: 'cus_0002',
      serviceId: 'svc_004',
      title: '仪表盘筛选条件咨询',
      description: '已提供配置说明并确认可用。',
      priority: 'low',
      status: 'closed',
      assigneeId: 'agt_004',
      createdAgo: 1440,
      dueAfter: 720,
    },
  ];
  let activitySequence = 1;
  const tickets: Ticket[] = specs.map((spec, index) => {
    const customer = customers.find((item) => item.id === spec.customerId)!;
    const service = services.find((item) => item.id === spec.serviceId)!;
    const agent = agents.find((item) => item.id === spec.assigneeId);
    const createdAt = isoAgo(spec.createdAgo);
    const resolvedAt =
      spec.status === 'resolved' || spec.status === 'closed'
        ? isoAgo(Math.max(10, spec.createdAgo - 80))
        : null;
    const activities: TicketActivity[] = [
      {
        id: `act_${String(activitySequence++).padStart(7, '0')}`,
        type: 'created',
        author: customer.contactName,
        content: '工单已创建',
        createdAt,
      },
    ];
    if (agent) {
      activities.unshift({
        id: `act_${String(activitySequence++).padStart(7, '0')}`,
        type: 'assigned',
        author: '服务台管理员',
        content: `分派给 ${agent.name}`,
        createdAt: isoAgo(Math.max(5, spec.createdAgo - 15)),
      });
    }
    return {
      id: `tkt_${String(index + 1).padStart(6, '0')}`,
      ticketNo: `SD-${new Date().getUTCFullYear()}-${String(index + 1).padStart(5, '0')}`,
      title: spec.title,
      description: spec.description,
      customerId: customer.id,
      customerName: customer.company,
      serviceId: service.id,
      serviceName: service.name,
      priority: spec.priority,
      status: spec.status,
      assigneeId: agent?.id ?? null,
      assigneeName: agent?.name ?? null,
      slaDueAt: isoAfter(spec.dueAfter),
      resolvedAt,
      createdAt,
      updatedAt: resolvedAt ?? isoAgo(Math.max(2, spec.createdAgo - 20)),
      activities,
    };
  });
  return {
    schemaVersion: 1,
    nextTicketSequence: tickets.length + 1,
    nextCustomerSequence: customers.length + 1,
    nextActivitySequence: activitySequence,
    customers,
    services,
    agents,
    tickets,
  };
}
