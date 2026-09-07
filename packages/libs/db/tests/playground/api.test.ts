import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createDatabasePlayground,
  type DatabasePlayground,
} from '../../playground/app.js';

describe.sequential('@nocobase/db playground API', () => {
  let playground: DatabasePlayground;
  let root: string;

  beforeEach(async () => {
    await mkdir('playground/tmp', { recursive: true });
    root = await mkdtemp('playground/tmp/api-test-');
    playground = await createDatabasePlayground({ root, reset: true });
  });

  afterEach(async () => {
    await playground.close();
    await rm(root, { recursive: true, force: true });
  });

  it('serves seeded managed and external business data', async () => {
    const health = await request('/api/health');
    const products = await request('/api/products');
    const customers = await request('/api/crm/customers');

    expect(health.status).toBe(200);
    expect(await health.json()).toMatchObject({
      data: { status: 'ok', connections: ['main', 'crm'] },
    });
    expect(await apiData<unknown[]>(products)).toHaveLength(3);
    expect(await apiData<unknown[]>(customers)).toHaveLength(3);
  });

  it('serves the browser playground assets', async () => {
    const html = await playground.app.request('/');
    const javascript = await playground.app.request('/app.js');
    const stylesheet = await playground.app.request('/style.css');

    expect(html.status).toBe(200);
    expect(html.headers.get('content-type')).toContain('text/html');
    expect(await html.text()).toContain('@nocobase/db playground');
    expect(javascript.headers.get('content-type')).toContain('text/javascript');
    expect(await javascript.text()).toContain('/api/database/connections');
    expect(stylesheet.headers.get('content-type')).toContain('text/css');
  });

  it('creates an order across the external CRM and managed transaction', async () => {
    const response = await request('/api/orders', {
      method: 'POST',
      body: {
        orderNo: 'TEST-1001',
        customerId: 1,
        items: [
          { productId: 1, quantity: 2 },
          { productId: 2, quantity: 1 },
        ],
      },
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      data: {
        orderNo: 'TEST-1001',
        customerNameSnapshot: 'Ada Lovelace',
        status: 'draft',
        totalAmount: 447.5,
        items: [
          { productId: 1, quantity: 2, subtotal: 258 },
          { productId: 2, quantity: 1, subtotal: 189.5 },
        ],
      },
    });

    const products = await apiData<Array<Record<string, unknown>>>(
      await request('/api/products'),
    );
    expect(products).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 1, stock: 16 }),
        expect.objectContaining({ id: 2, stock: 10 }),
      ]),
    );
  });

  it('rolls back the order when inventory validation fails', async () => {
    const response = await request('/api/orders', {
      method: 'POST',
      body: {
        orderNo: 'TEST-NO-STOCK',
        customerId: 1,
        items: [{ productId: 3, quantity: 99 }],
      },
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: { code: 'INSUFFICIENT_STOCK' },
    });
    expect(await apiData<unknown[]>(await request('/api/orders'))).toEqual([]);
  });

  it('provides CRUD for external CRM records', async () => {
    const created = await request('/api/crm/customers', {
      method: 'POST',
      body: {
        name: 'Katherine Johnson',
        email: 'katherine@example.com',
        company: 'Orbital Dynamics',
      },
    });
    expect(created.status).toBe(201);
    const customer = await apiData<{ id: number }>(created);

    const updated = await request(`/api/crm/customers/${customer.id}`, {
      method: 'PATCH',
      body: { status: 'inactive' },
    });
    expect(await updated.json()).toMatchObject({
      data: { name: 'Katherine Johnson', status: 'inactive' },
    });

    const removed = await request(`/api/crm/customers/${customer.id}`, {
      method: 'DELETE',
    });
    expect(removed.status).toBe(204);
  });

  it('exposes resolved Collections and schema management boundaries', async () => {
    const connections = await request('/api/database/connections');
    expect(await connections.json()).toMatchObject({
      data: [
        {
          name: 'main',
          schemaManagement: 'managed',
          metadataCapabilities: { writable: true },
        },
        {
          name: 'crm',
          schemaManagement: 'external',
          metadataCapabilities: { writable: false },
        },
      ],
    });

    const collection = await request('/api/database/crm/customers');
    expect(await collection.json()).toMatchObject({
      data: {
        summary: { name: 'customers', tableName: 'crm_customers' },
        metadata: { document: { title: 'CRM customers' } },
        resolution: { collection: { name: 'customers' } },
      },
    });

    const schemaWrite = await request(
      '/api/database/crm/boundaries/schema-write',
      { method: 'POST' },
    );
    expect(await schemaWrite.json()).toMatchObject({
      data: { rejected: true, code: 'SCHEMA_MANAGEMENT_NOT_ALLOWED' },
    });
    const metadataWrite = await request(
      '/api/database/crm/boundaries/metadata-write',
      { method: 'POST' },
    );
    expect(await metadataWrite.json()).toMatchObject({
      data: { rejected: true, code: 'METADATA_STORE_READ_ONLY' },
    });
  });

  async function request(
    pathname: string,
    options: { readonly method?: string; readonly body?: unknown } = {},
  ): Promise<Response> {
    return playground.app.request(pathname, {
      method: options.method,
      headers:
        options.body === undefined
          ? undefined
          : { 'content-type': 'application/json' },
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  }
});

async function apiData<T>(response: Response): Promise<T> {
  const payload: unknown = await response.json();
  if (!payload || typeof payload !== 'object' || !('data' in payload)) {
    throw new Error('Expected an API response containing data.');
  }
  return payload.data as T;
}
