import { randomUUID } from 'node:crypto';
import type { Audit, AuditData } from '@nocobase/audit';
import {
  logAuditBestEffort,
  type AuditFailureReporter,
} from '@nocobase/app-plugin-audit/server';
import type { AuthorizationScope } from '@nocobase/authorization/core';
import { RepositoryError, type DatabaseManager } from '@nocobase/db';
import type {
  Customer,
  CustomerInput,
  CustomerUpdate,
  CustomerDelete,
  CustomerOperation,
} from '../types.js';

function mask(phone: string): string {
  return `${phone.slice(0, 3)}****${phone.slice(-4)}`;
}

export class CustomerService {
  public constructor(
    private readonly database: DatabaseManager,
    private readonly report: AuditFailureReporter,
    private readonly appName: string,
  ) {}

  public async list(identity: AuthorizationScope): Promise<Customer[]> {
    await identity.require({
      resource: { type: 'audit-example.customer', id: '*' },
      action: 'list',
    });
    return this.database
      .repository<Customer>('auditExampleCustomers')
      .findMany({
        filter: { ownerId: identity.identity.principal.id },
        sort: (s) => [s.field('id').desc()],
        limit: 100,
      });
  }

  public async create(
    identity: AuthorizationScope,
    input: CustomerInput,
    audit: Audit,
  ): Promise<Customer> {
    await identity.require({
      resource: { type: 'audit-example.customer', id: '*' },
      action: 'create',
    });
    const ownerId = identity.identity.principal.id;
    const customer = await this.database.transaction(async (connection) => {
      const result = await connection
        .repository<Customer>('auditExampleCustomers')
        .createOne({
          values: { id: randomUUID(), ownerId, ...input },
          select: (s) => s.fields('id', 'ownerId', 'name', 'phone', 'version'),
        });
      return result.record;
    });
    await this.record(audit, 'created', customer, {
      phone: mask(customer.phone),
    });
    return customer;
  }

  public async update(
    identity: AuthorizationScope,
    input: CustomerUpdate,
    audit: Audit,
  ): Promise<Customer> {
    await identity.require({
      resource: { type: 'audit-example.customer', id: input.id },
      action: 'update',
    });
    const change = await this.database.transaction(async (connection) => {
      const repo = connection.repository<Customer>('auditExampleCustomers');
      const filter = { id: input.id, ownerId: identity.identity.principal.id };
      const before = await repo.findOne({ filter });
      if (!before)
        throw new RepositoryError('RECORD_NOT_FOUND', 'Customer not found.');
      if (before.version !== input.version)
        throw new RepositoryError(
          'VERSION_CONFLICT',
          'Customer version changed.',
        );
      if (before.name === input.name && before.phone === input.phone)
        return { before, after: before };
      const after = await repo.updateOne({
        filter,
        values: { name: input.name, phone: input.phone },
        ifVersion: input.version,
        select: (s) => s.fields('id', 'ownerId', 'name', 'phone', 'version'),
      });
      return { before, after: after.record };
    });
    const changes: Record<string, AuditData> = {};
    if (change.before.phone !== change.after.phone)
      changes.phone = {
        before: mask(change.before.phone),
        after: mask(change.after.phone),
      };
    if (change.before.name !== change.after.name)
      changes.name = { before: change.before.name, after: change.after.name };
    if (Object.keys(changes).length)
      await this.record(audit, 'updated', change.after, { changes });
    return change.after;
  }

  public async remove(
    identity: AuthorizationScope,
    input: CustomerDelete,
    audit: Audit,
  ): Promise<void> {
    await identity.require({
      resource: { type: 'audit-example.customer', id: input.id },
      action: 'delete',
    });
    const customer = await this.database.transaction(async (connection) => {
      const result = await connection
        .repository<Customer>('auditExampleCustomers')
        .deleteOne({
          filter: { id: input.id, ownerId: identity.identity.principal.id },
          ifVersion: input.version,
          select: (s) => s.fields('id', 'ownerId', 'name', 'phone', 'version'),
        });
      return result.record;
    });
    await this.record(audit, 'deleted', customer, {});
  }

  public async logs(
    identity: AuthorizationScope,
    targetId?: string,
  ): Promise<CustomerOperation[]> {
    await identity.require({
      resource: { type: 'audit-example.customer', id: '*' },
      action: 'readLogs',
    });
    return this.database
      .repository<CustomerOperation>('auditExampleOperations')
      .findMany({
        filter: {
          ownerId: identity.identity.principal.id,
          appName: this.appName,
          targetType: 'crm.customer',
          ...(targetId ? { targetId } : {}),
        },
        sort: (s) => [s.field('occurredAt').desc(), s.field('id').desc()],
        limit: 100,
      });
  }

  private async record(
    audit: Audit,
    action: string,
    customer: Customer,
    data: AuditData,
  ): Promise<void> {
    await logAuditBestEffort(
      audit,
      {
        action: `crm.customer.${action}`,
        target: { type: 'crm.customer', id: customer.id },
        result: 'success',
        data: { ...data, ownerId: customer.ownerId },
      },
      this.report,
    );
  }
}
