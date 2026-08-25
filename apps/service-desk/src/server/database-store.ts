import type { DatabaseManager } from '@nocobase/app-database';
import type { Knex } from 'knex';

import {
  ServiceDeskStoreError,
  type Customer,
  type ServiceCatalogItem,
  type ServiceDeskDashboard,
  type ServiceDeskState,
  type SupportAgent,
  type Ticket,
  type TicketActivity,
  type TicketDraft,
  type TicketPriority,
  type TicketStatus,
} from './store.js';

const allowedTransitions: Record<TicketStatus, readonly TicketStatus[]> = {
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

export class DatabaseServiceDeskStore {
  constructor(private readonly database: DatabaseManager) {}

  async snapshot(): Promise<ServiceDeskState> {
    const knex = await this.database.connection().client<Knex>();
    const [
      customerRows,
      serviceRows,
      agentRows,
      ticketRows,
      activityRows,
      metaRows,
    ] = await Promise.all([
      knex('app_service_desk_customers')
        .select('*')
        .orderBy('createdAt', 'desc'),
      knex('app_service_desk_services').select('*').orderBy('name', 'asc'),
      knex('app_service_desk_agents').select('*').orderBy('name', 'asc'),
      knex('app_service_desk_tickets').select('*').orderBy('createdAt', 'desc'),
      knex('app_service_desk_activities')
        .select('*')
        .orderBy('createdAt', 'desc'),
      knex('app_service_desk_meta').select('*'),
    ]);
    const activitiesByTicket = new Map<string, TicketActivity[]>();
    for (const row of activityRows as Record<string, unknown>[]) {
      const ticketId = stringValue(row.ticketId);
      const activities = activitiesByTicket.get(ticketId) ?? [];
      activities.push(toActivity(row));
      activitiesByTicket.set(ticketId, activities);
    }
    const meta = new Map(
      (metaRows as Record<string, unknown>[]).map((row) => [
        stringValue(row.key),
        numberValue(row.value),
      ]),
    );
    return {
      schemaVersion: 1,
      nextTicketSequence: meta.get('nextTicketSequence') ?? 1,
      nextCustomerSequence: meta.get('nextCustomerSequence') ?? 1,
      nextActivitySequence: meta.get('nextActivitySequence') ?? 1,
      customers: (customerRows as Record<string, unknown>[]).map(toCustomer),
      services: (serviceRows as Record<string, unknown>[]).map(toService),
      agents: (agentRows as Record<string, unknown>[]).map(toAgent),
      tickets: (ticketRows as Record<string, unknown>[]).map((row) =>
        toTicket(row, activitiesByTicket.get(stringValue(row.id)) ?? []),
      ),
    };
  }

  async dashboard(now: Date = new Date()): Promise<ServiceDeskDashboard> {
    const { tickets } = await this.snapshot();
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
    for (const ticket of tickets) {
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
      ticketCount: tickets.length,
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
    return this.database.transaction(async (connection) => {
      const knex = await connection.client<Knex>();
      const customer = await requireCustomer(knex, draft.customerId);
      const service = await requireService(knex, draft.serviceId);
      const priority = requirePriority(draft.priority);
      const sequence = await takeSequence(knex, 'nextTicketSequence');
      const now = new Date();
      const ticket: Ticket = {
        id: `tkt_${String(sequence).padStart(6, '0')}`,
        ticketNo: `SD-${now.getUTCFullYear()}-${String(sequence).padStart(5, '0')}`,
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
      const activity = await createActivity(
        knex,
        ticket.id,
        'created',
        '系统',
        '工单已创建',
        ticket.createdAt,
      );
      ticket.activities.push(activity);
      await insertTicket(knex, ticket);
      return ticket;
    });
  }

  async updateTicket(id: string, input: Partial<TicketDraft>): Promise<Ticket> {
    return this.database.transaction(async (connection) => {
      const knex = await connection.client<Knex>();
      const ticket = await requireTicket(knex, id);
      ensureEditable(ticket);
      const updates: Record<string, unknown> = {};
      if (input.title !== undefined)
        updates.title = requireText(input.title, '工单标题', 180);
      if (input.description !== undefined)
        updates.description = normalizeText(input.description, 3000);
      if (input.customerId !== undefined) {
        const customer = await requireCustomer(knex, input.customerId);
        updates.customerId = customer.id;
        updates.customerName = customer.company;
      }
      let service: ServiceCatalogItem | undefined;
      if (input.serviceId !== undefined) {
        service = await requireService(knex, input.serviceId);
        updates.serviceId = service.id;
        updates.serviceName = service.name;
      }
      const priority =
        input.priority === undefined
          ? ticket.priority
          : requirePriority(input.priority);
      if (input.priority !== undefined) updates.priority = priority;
      if ((service || input.priority !== undefined) && !ticket.resolvedAt) {
        const selectedService =
          service ?? (await requireService(knex, ticket.serviceId));
        updates.slaDueAt = calculateSlaDueAt(
          new Date(ticket.createdAt),
          selectedService.slaMinutes,
          priority,
        );
      }
      updates.updatedAt = new Date().toISOString();
      await knex('app_service_desk_tickets').where({ id }).update(updates);
      const activity = await createActivity(
        knex,
        id,
        'updated',
        '服务台管理员',
        '更新了工单信息',
      );
      return {
        ...ticket,
        ...normalizeTicketUpdates(updates),
        activities: [activity, ...ticket.activities],
      };
    });
  }

  async assignTicket(id: string, agentId: string): Promise<Ticket> {
    return this.database.transaction(async (connection) => {
      const knex = await connection.client<Knex>();
      const ticket = await requireTicket(knex, id);
      ensureEditable(ticket);
      const agent = await requireAgent(knex, agentId);
      if (agent.status === 'offline') throw notFound('可用客服');
      const status: TicketStatus =
        ticket.status === 'new' ? 'assigned' : ticket.status;
      const updatedAt = new Date().toISOString();
      await knex('app_service_desk_tickets').where({ id }).update({
        assigneeId: agent.id,
        assigneeName: agent.name,
        status,
        updatedAt,
      });
      const activity = await createActivity(
        knex,
        id,
        'assigned',
        '服务台管理员',
        `分派给 ${agent.name}`,
        updatedAt,
      );
      return {
        ...ticket,
        assigneeId: agent.id,
        assigneeName: agent.name,
        status,
        updatedAt,
        activities: [activity, ...ticket.activities],
      };
    });
  }

  async transitionTicket(
    id: string,
    nextStatus: TicketStatus,
  ): Promise<Ticket> {
    return this.database.transaction(async (connection) => {
      const knex = await connection.client<Knex>();
      const ticket = await requireTicket(knex, id);
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
      const updatedAt = new Date().toISOString();
      const resolvedAt =
        nextStatus === 'resolved'
          ? updatedAt
          : nextStatus === 'in_progress' && ticket.status === 'resolved'
            ? null
            : ticket.resolvedAt;
      await knex('app_service_desk_tickets').where({ id }).update({
        status: nextStatus,
        resolvedAt,
        updatedAt,
      });
      const activity = await createActivity(
        knex,
        id,
        'status',
        ticket.assigneeName ?? '服务台管理员',
        `状态由 ${ticket.status} 变更为 ${nextStatus}`,
        updatedAt,
      );
      return {
        ...ticket,
        status: nextStatus,
        resolvedAt,
        updatedAt,
        activities: [activity, ...ticket.activities],
      };
    });
  }

  async addReply(id: string, content: string): Promise<Ticket> {
    return this.database.transaction(async (connection) => {
      const knex = await connection.client<Knex>();
      const ticket = await requireTicket(knex, id);
      ensureEditable(ticket);
      const updatedAt = new Date().toISOString();
      const status: TicketStatus =
        ticket.status === 'waiting' ? 'in_progress' : ticket.status;
      await knex('app_service_desk_tickets')
        .where({ id })
        .update({ status, updatedAt });
      const activity = await createActivity(
        knex,
        id,
        'reply',
        ticket.assigneeName ?? '服务台管理员',
        requireText(content, '回复内容', 2000),
        updatedAt,
      );
      return {
        ...ticket,
        status,
        updatedAt,
        activities: [activity, ...ticket.activities],
      };
    });
  }

  async deleteTicket(id: string): Promise<void> {
    await this.database.transaction(async (connection) => {
      const knex = await connection.client<Knex>();
      const ticket = await requireTicket(knex, id);
      if (ticket.status !== 'new' && ticket.status !== 'closed') {
        throw new ServiceDeskStoreError('只能删除新建或已关闭的工单', {
          status: 409,
          code: 'TICKET_DELETE_BLOCKED',
        });
      }
      await knex('app_service_desk_activities')
        .where({ ticketId: id })
        .delete();
      await knex('app_service_desk_tickets').where({ id }).delete();
    });
  }

  async createCustomer(
    input: Omit<Customer, 'id' | 'createdAt'>,
  ): Promise<Customer> {
    return this.database.transaction(async (connection) => {
      const knex = await connection.client<Knex>();
      const company = requireText(input.company, '客户名称', 160);
      if (await knex('app_service_desk_customers').where({ company }).first()) {
        throw new ServiceDeskStoreError('客户名称已存在', {
          status: 409,
          code: 'CUSTOMER_EXISTS',
        });
      }
      const sequence = await takeSequence(knex, 'nextCustomerSequence');
      const customer: Customer = {
        id: `cus_${String(sequence).padStart(4, '0')}`,
        company,
        contactName: requireText(input.contactName, '联系人', 120),
        phone: normalizeText(input.phone, 64),
        email: normalizeText(input.email, 320),
        level: requireCustomerLevel(input.level),
        createdAt: new Date().toISOString(),
      };
      await knex('app_service_desk_customers').insert(customer);
      return customer;
    });
  }
}

async function requireTicket(knex: Knex, id: string): Promise<Ticket> {
  const row = (await knex('app_service_desk_tickets').where({ id }).first()) as
    Record<string, unknown> | undefined;
  if (!row) throw notFound('工单');
  const activityRows = (await knex('app_service_desk_activities')
    .where({ ticketId: id })
    .orderBy('createdAt', 'desc')) as Record<string, unknown>[];
  return toTicket(row, activityRows.map(toActivity));
}

async function requireCustomer(knex: Knex, id: string): Promise<Customer> {
  const row = (await knex('app_service_desk_customers')
    .where({ id })
    .first()) as Record<string, unknown> | undefined;
  if (!row) throw notFound('客户');
  return toCustomer(row);
}

async function requireService(
  knex: Knex,
  id: string,
): Promise<ServiceCatalogItem> {
  const row = (await knex('app_service_desk_services')
    .where({ id, status: 'active' })
    .first()) as Record<string, unknown> | undefined;
  if (!row) throw notFound('可用服务');
  return toService(row);
}

async function requireAgent(knex: Knex, id: string): Promise<SupportAgent> {
  const row = (await knex('app_service_desk_agents').where({ id }).first()) as
    Record<string, unknown> | undefined;
  if (!row) throw notFound('可用客服');
  return toAgent(row);
}

async function insertTicket(knex: Knex, ticket: Ticket): Promise<void> {
  const { activities: _activities, ...record } = ticket;
  await knex('app_service_desk_tickets').insert(record);
}

async function createActivity(
  knex: Knex,
  ticketId: string,
  type: TicketActivity['type'],
  author: string,
  content: string,
  createdAt: string = new Date().toISOString(),
): Promise<TicketActivity> {
  const sequence = await takeSequence(knex, 'nextActivitySequence');
  const activity: TicketActivity = {
    id: `act_${String(sequence).padStart(7, '0')}`,
    type,
    author,
    content,
    createdAt,
  };
  await knex('app_service_desk_activities').insert({ ticketId, ...activity });
  return activity;
}

async function takeSequence(knex: Knex, key: string): Promise<number> {
  const row = (await knex('app_service_desk_meta').where({ key }).first()) as
    { value?: number | string } | undefined;
  const value = Number(row?.value ?? 1);
  if (row)
    await knex('app_service_desk_meta')
      .where({ key })
      .update({ value: value + 1 });
  else await knex('app_service_desk_meta').insert({ key, value: value + 1 });
  return value;
}

function toCustomer(row: Record<string, unknown>): Customer {
  return {
    id: stringValue(row.id),
    company: stringValue(row.company),
    contactName: stringValue(row.contactName),
    phone: stringValue(row.phone),
    email: stringValue(row.email),
    level: requireCustomerLevel(row.level),
    createdAt: dateValue(row.createdAt),
  };
}

function toService(row: Record<string, unknown>): ServiceCatalogItem {
  return {
    id: stringValue(row.id),
    name: stringValue(row.name),
    category: stringValue(row.category),
    ownerTeam: stringValue(row.ownerTeam),
    slaMinutes: numberValue(row.slaMinutes),
    status: row.status === 'inactive' ? 'inactive' : 'active',
  };
}

function toAgent(row: Record<string, unknown>): SupportAgent {
  return {
    id: stringValue(row.id),
    name: stringValue(row.name),
    team: stringValue(row.team),
    role: row.role === 'lead' ? 'lead' : 'agent',
    status:
      row.status === 'offline'
        ? 'offline'
        : row.status === 'busy'
          ? 'busy'
          : 'online',
  };
}

function toActivity(row: Record<string, unknown>): TicketActivity {
  const type = row.type;
  if (
    type !== 'created' &&
    type !== 'assigned' &&
    type !== 'status' &&
    type !== 'reply' &&
    type !== 'updated'
  ) {
    throw new ServiceDeskStoreError('工单活动类型无效', {
      status: 500,
      code: 'INVALID_STORED_STATE',
    });
  }
  return {
    id: stringValue(row.id),
    type,
    author: stringValue(row.author),
    content: stringValue(row.content),
    createdAt: dateValue(row.createdAt),
  };
}

function toTicket(
  row: Record<string, unknown>,
  activities: TicketActivity[],
): Ticket {
  return {
    id: stringValue(row.id),
    ticketNo: stringValue(row.ticketNo),
    title: stringValue(row.title),
    description: stringValue(row.description),
    customerId: stringValue(row.customerId),
    customerName: stringValue(row.customerName),
    serviceId: stringValue(row.serviceId),
    serviceName: stringValue(row.serviceName),
    priority: requirePriority(row.priority),
    status: requireStatus(row.status),
    assigneeId: nullableString(row.assigneeId),
    assigneeName: nullableString(row.assigneeName),
    slaDueAt: dateValue(row.slaDueAt),
    resolvedAt: nullableDate(row.resolvedAt),
    createdAt: dateValue(row.createdAt),
    updatedAt: dateValue(row.updatedAt),
    activities,
  };
}

function normalizeTicketUpdates(
  updates: Record<string, unknown>,
): Partial<Ticket> {
  const normalized: Partial<Ticket> = {};
  if ('title' in updates) normalized.title = stringValue(updates.title);
  if ('description' in updates)
    normalized.description = stringValue(updates.description);
  if ('customerId' in updates)
    normalized.customerId = stringValue(updates.customerId);
  if ('customerName' in updates)
    normalized.customerName = stringValue(updates.customerName);
  if ('serviceId' in updates)
    normalized.serviceId = stringValue(updates.serviceId);
  if ('serviceName' in updates)
    normalized.serviceName = stringValue(updates.serviceName);
  if ('priority' in updates)
    normalized.priority = requirePriority(updates.priority);
  if ('slaDueAt' in updates)
    normalized.slaDueAt = stringValue(updates.slaDueAt);
  if ('updatedAt' in updates)
    normalized.updatedAt = stringValue(updates.updatedAt);
  return normalized;
}

function ensureEditable(ticket: Ticket): void {
  if (ticket.status === 'closed') {
    throw new ServiceDeskStoreError('已关闭工单不能修改', {
      status: 409,
      code: 'TICKET_CLOSED',
    });
  }
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

function requireStatus(value: unknown): TicketStatus {
  if (
    value === 'new' ||
    value === 'assigned' ||
    value === 'in_progress' ||
    value === 'waiting' ||
    value === 'resolved' ||
    value === 'closed'
  )
    return value;
  throw new ServiceDeskStoreError('工单状态无效', {
    status: 500,
    code: 'INVALID_STORED_STATE',
  });
}

function requirePriority(value: unknown): TicketPriority {
  if (
    value === 'low' ||
    value === 'normal' ||
    value === 'high' ||
    value === 'urgent'
  )
    return value;
  throw new ServiceDeskStoreError('优先级无效', {
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
    throw new ServiceDeskStoreError(`${label}不能为空`, {
      status: 400,
      code: 'VALIDATION_ERROR',
    });
  return normalized;
}

function normalizeText(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function notFound(label: string): ServiceDeskStoreError {
  return new ServiceDeskStoreError(`${label}不存在`, {
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

function nullableString(value: unknown): string | null {
  const normalized = stringValue(value);
  return normalized ? normalized : null;
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
  throw new ServiceDeskStoreError('工单日期无效', {
    status: 500,
    code: 'INVALID_STORED_STATE',
  });
}

function nullableDate(value: unknown): string | null {
  return value == null ? null : dateValue(value);
}
