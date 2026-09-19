// @vitest-environment node
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createJsonlAuditWriter } from '@nocobase/audit/writers/jsonl';
import type { AuditEvent } from '@nocobase/audit';
import { expect, it } from 'vitest';
import { createFixture } from './helpers.js';

it('replaces repository output with JSONL without changing the business entry', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'customer-audit-output-'));
  const file = join(directory, 'events.jsonl');
  const f = await createFixture(() => createJsonlAuditWriter(file));
  try {
    const response = await f.request('/customers', 'POST', {
      name: 'File destination',
      phone: '13800001234',
    });
    expect(response.status).toBe(201);
    const event = JSON.parse(
      (await readFile(file, 'utf8')).trim(),
    ) as AuditEvent;
    expect(event).toMatchObject({
      action: 'crm.customer.created',
      actor: { id: f.alice.id },
      source: { type: 'http' },
      data: { phone: '138****1234' },
    });
    expect(await f.database.repository('auditExampleCustomers').count()).toBe(
      1,
    );
    expect(await f.database.repository('auditExampleOperations').count()).toBe(
      0,
    );
  } finally {
    await f.close();
    await rm(directory, { recursive: true, force: true });
  }
});
