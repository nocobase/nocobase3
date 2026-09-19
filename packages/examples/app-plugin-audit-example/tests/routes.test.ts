// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Customer, CustomerOperation } from '../server/types.js';
import { authorizationToken } from '@nocobase/app-plugin-authorization';
import { initializeCustomerPermissions } from '../server/authorization.js';
import { createFixture } from './helpers.js';

describe('customer audit through authenticated HTTP and real SQLite', () => {
  let f: Awaited<ReturnType<typeof createFixture>>;
  beforeAll(async () => {
    f = await createFixture();
  });
  afterAll(async () => {
    await f?.close();
  });
  async function create(name = 'Customer'): Promise<Customer> {
    const response = await f.request('/customers', 'POST', {
      name,
      phone: '13800001234',
    });
    expect(response.status).toBe(201);
    return ((await response.json()) as { data: Customer }).data;
  }
  async function logs(
    id: string,
    cookie?: string,
  ): Promise<CustomerOperation[]> {
    const response = await f.request(
      `/operations?targetId=${id}`,
      'GET',
      undefined,
      cookie,
    );
    expect(response.status).toBe(200);
    return ((await response.json()) as { data: CustomerOperation[] }).data;
  }
  it('protects every route without leaking middleware to other contributions', async () => {
    for (const [path, method] of [
      ['/customers', 'GET'],
      ['/customers', 'POST'],
      ['/customers/x', 'PATCH'],
      ['/customers/x', 'DELETE'],
      ['/operations', 'GET'],
      ['/maintenance', 'POST'],
    ]) {
      expect(
        (await f.request(path!, method, method === 'GET' ? undefined : {}, ''))
          .status,
      ).toBe(401);
    }
    expect((await f.router.request('/api/unrelated')).status).toBe(200);
  });
  it('creates, edits, queries masked changes, and retains history after deletion', async () => {
    const customer = await create();
    const updated = await f.request(`/customers/${customer.id}`, 'PATCH', {
      id: customer.id,
      version: customer.version,
      name: customer.name,
      phone: '13900005678',
    });
    expect(updated.status).toBe(200);
    const after = ((await updated.json()) as { data: Customer }).data;
    expect(after.version).toBe(customer.version + 1);
    const history = await logs(customer.id);
    expect(history.map((event) => event.action)).toEqual([
      'crm.customer.updated',
      'crm.customer.created',
    ]);
    expect(history[0]).toMatchObject({
      actor: { type: 'user', id: f.alice.id },
      source: { type: 'http', requestId: expect.any(String) },
      data: {
        changes: { phone: { before: '138****1234', after: '139****5678' } },
      },
    });
    expect(JSON.stringify(history)).not.toMatch(/13800001234|13900005678/);
    expect(
      (
        await f.request(`/customers/${customer.id}`, 'DELETE', {
          id: customer.id,
          version: after.version,
        })
      ).status,
    ).toBe(200);
    expect(
      await f.database
        .repository('auditExampleCustomers')
        .exists({ filter: { id: customer.id } }),
    ).toBe(false);
    expect((await logs(customer.id)).map((event) => event.action)).toEqual([
      'crm.customer.deleted',
      'crm.customer.updated',
      'crm.customer.created',
    ]);
  });
  it('does not create success events for conflicts, invalid inputs, or unchanged edits', async () => {
    const customer = await create('No-op');
    const edit = {
      id: customer.id,
      version: customer.version,
      name: customer.name,
      phone: customer.phone,
    };
    expect(
      (await f.request(`/customers/${customer.id}`, 'PATCH', edit)).status,
    ).toBe(200);
    expect(await logs(customer.id)).toHaveLength(1);
    expect(
      (
        await f.request(`/customers/${customer.id}`, 'PATCH', {
          ...edit,
          version: 999,
          phone: '13900005678',
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await f.request(`/customers/${customer.id}`, 'PATCH', {
          ...edit,
          actor: { id: 'forged' },
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await f.request(`/customers/${customer.id}`, 'DELETE', {
          id: customer.id,
          version: 999,
        })
      ).status,
    ).toBe(409);
    expect(await logs(customer.id)).toHaveLength(1);
  });
  it('isolates customer and history reads and rejects another user on all mutation paths', async () => {
    const customer = await create('Private');
    expect(await logs(customer.id, f.bob.cookie)).toEqual([]);
    const list = await f.request('/customers', 'GET', undefined, f.bob.cookie);
    expect(await list.json()).toEqual({ data: [] });
    const edit = {
      id: customer.id,
      version: customer.version,
      name: 'Intruder',
      phone: '13900005678',
    };
    expect(
      (
        await f.request(
          `/customers/${customer.id}`,
          'PATCH',
          edit,
          f.bob.cookie,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await f.request(
          `/customers/${customer.id}`,
          'DELETE',
          { id: customer.id, version: customer.version },
          f.bob.cookie,
        )
      ).status,
    ).toBe(403);
    expect(
      (await f.request('/maintenance', 'POST', edit, f.bob.cookie)).status,
    ).toBe(403);
  });
  it('does not retry a committed mutation when audit output and diagnostics fail', async () => {
    const customer = await create('Output failure');
    f.write.mockRejectedValueOnce(new Error('private SQL phone=13900005678'));
    f.report.mockImplementationOnce(() => {
      throw new Error('diagnostic failure');
    });
    const response = await f.request(`/customers/${customer.id}`, 'PATCH', {
      id: customer.id,
      version: customer.version,
      name: 'Saved',
      phone: '13900005678',
    });
    expect(response.status).toBe(200);
    expect(
      await f.database
        .repository('auditExampleCustomers')
        .findOne({ filter: { id: customer.id } }),
    ).toMatchObject({ version: customer.version + 1, name: 'Saved' });
    expect(await logs(customer.id)).toHaveLength(1);
    expect(f.report).toHaveBeenCalledWith(
      { code: 'AUDIT_WRITE_FAILED', eventId: expect.any(String) },
      'Customer audit output failed.',
    );
    expect(JSON.stringify(f.report.mock.calls)).not.toContain('13900005678');
  });
  it('runs the real Job with trusted initiator and worker execution metadata', async () => {
    const customer = await create('Job');
    const response = await f.request('/maintenance', 'POST', {
      id: customer.id,
      version: customer.version,
      name: 'Job updated',
      phone: '13900005678',
    });
    expect(response.status).toBe(202);
    const history = await logs(customer.id);
    expect(history[0]).toMatchObject({
      actor: { type: 'service', id: 'customer-maintenance' },
      initiator: { type: 'user', id: f.alice.id },
      source: {
        type: 'job',
        jobId: expect.any(String),
        attempt: expect.any(Number),
      },
      action: 'crm.customer.updated',
    });
  });
  it('contains Job audit failures after commit instead of failing the Job', async () => {
    const customer = await create('Job output failure');
    f.write.mockRejectedValueOnce(new Error('output unavailable'));
    const response = await f.request('/maintenance', 'POST', {
      id: customer.id,
      version: customer.version,
      name: 'Committed once',
      phone: '13900005678',
    });
    expect(response.status).toBe(202);
    expect(
      await f.database
        .repository('auditExampleCustomers')
        .findOne({ filter: { id: customer.id } }),
    ).toMatchObject({ version: customer.version + 1, name: 'Committed once' });
  });
  it('publishes page access and preserves a revoked membership on reinitialization', async () => {
    const authorization = f.container.resolve(authorizationToken);
    const identity = authorization.for({
      principal: { type: 'user', id: f.alice.id },
      subjects: [{ type: 'authenticated', id: '*' }],
    });
    expect((await identity.permissions()).permissions).toContainEqual({
      resource: { type: 'audit-example.customer', id: '*' },
      actions: ['create', 'delete', 'list', 'readLogs', 'update'],
    });
    const assignments = await authorization.permissionSets.listAssignments(
      'audit-example-member',
    );
    expect(assignments).toHaveLength(1);
    await authorization.permissionSets.revoke(assignments[0]!.id);
    await initializeCustomerPermissions(authorization, f.database);
    expect((await f.request('/customers')).status).toBe(403);
    expect((await f.request('/operations')).status).toBe(403);
    expect(
      (
        await f.request('/customers', 'POST', {
          name: 'Revoked',
          phone: '13800001234',
        })
      ).status,
    ).toBe(403);
  });
});
