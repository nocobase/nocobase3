import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  createAudit,
  type AuditContext,
  type AuditInput,
  type AuditEvent,
} from '../src/index.js';
import { createJsonlAuditWriter } from '../src/writers/jsonl.js';
import { createRepositoryAuditWriter } from '../src/writers/repository.js';

const context = (): AuditContext => ({
  appName: 'crm',
  actor: { type: 'user', id: 'alice' },
  source: { type: 'http', requestId: 'r1' },
});
const input: AuditInput = { action: 'customer.updated', result: 'success' };

describe('explicit audit', () => {
  it('captures a deep immutable snapshot before the first asynchronous write', async () => {
    const ctx = { ...context(), actor: { type: 'user', id: 'alice' } };
    const data = { nested: { label: 'original' } };
    let event: AuditEvent | undefined;
    const gate = Promise.withResolvers<void>();
    const audit = createAudit({
      context: () => ctx,
      write: async (value) => {
        await gate.promise;
        event = value;
      },
    });
    const pending = audit.log({ ...input, data });
    ctx.actor.id = 'mallory';
    data.nested.label = 'mutated';
    gate.resolve();
    await pending;
    expect(event).toMatchObject({
      schemaVersion: 1,
      actor: { id: 'alice' },
      data: { nested: { label: 'original' } },
    });
    expect(event?.id).toMatch(/^[a-f0-9-]{36}$/);
    expect(Number.isFinite(Date.parse(event!.occurredAt))).toBe(true);
    expect(Object.isFrozen(event?.data.nested)).toBe(true);
  });
  it('reads context on each call and generates unique event identifiers', async () => {
    const values: AuditEvent[] = [];
    let id = 'alice';
    const audit = createAudit({
      context: () => ({ ...context(), actor: { type: 'user', id } }),
      write: async (event) => {
        values.push(event);
      },
    });
    await audit.log(input);
    id = 'bob';
    await audit.log(input);
    expect(values.map((event) => event.actor.id)).toEqual(['alice', 'bob']);
    expect(new Set(values.map((event) => event.id)).size).toBe(2);
    expect(values[0]?.data).toEqual({});
  });
  it.each([
    NaN,
    Infinity,
    undefined,
    () => 1,
    new Date(),
    new Map(),
    Array(2),
    { [Symbol('secret')]: 1 },
  ])(
    'rejects non-JSON data without calling the writer: %s',
    async (invalid) => {
      const write = vi.fn();
      const audit = createAudit({ context, write });
      await expect(
        audit.log({ ...input, data: { invalid } } as unknown as AuditInput),
      ).rejects.toMatchObject({ code: 'AUDIT_INVALID_EVENT' });
      expect(write).not.toHaveBeenCalled();
    },
  );
  it('rejects getters without invoking them', async () => {
    const secret = vi.fn(() => 'secret');
    const data = Object.defineProperty({}, 'secret', {
      enumerable: true,
      get: secret,
    });
    await expect(
      createAudit({ context, write: vi.fn() }).log({ ...input, data }),
    ).rejects.toMatchObject({ code: 'AUDIT_INVALID_EVENT' });
    expect(secret).not.toHaveBeenCalled();
  });
  it('rejects cycles but allows repeated JSON references and safe __proto__ keys', async () => {
    const write = vi.fn();
    const audit = createAudit({ context, write });
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    await expect(
      audit.log({ ...input, data: cycle } as AuditInput),
    ).rejects.toMatchObject({ code: 'AUDIT_INVALID_EVENT' });
    const shared = { ok: true };
    await audit.log({
      ...input,
      data: {
        a: shared,
        b: shared,
        ...JSON.parse('{"__proto__":{"safe":true}}'),
      },
    });
    expect(write).toHaveBeenCalledOnce();
    const event = write.mock.calls[0]![0] as AuditEvent;
    expect(Object.hasOwn(event.data, '__proto__')).toBe(true);
    expect(event.data.a).not.toBe(shared);
  });
  it('rejects caller identity overrides and invalid trusted context', async () => {
    const write = vi.fn();
    await expect(
      createAudit({ context, write }).log({
        ...input,
        actor: { type: 'user', id: 'bob' },
      } as AuditInput),
    ).rejects.toMatchObject({ code: 'AUDIT_INVALID_EVENT' });
    await expect(
      createAudit({
        context: () => ({ ...context(), appName: '' }),
        write,
      }).log(input),
    ).rejects.toMatchObject({ code: 'AUDIT_INVALID_CONTEXT' });
    expect(write).not.toHaveBeenCalled();
  });
  it('reports output failure once without exposing input or backend details', async () => {
    const write = vi.fn().mockRejectedValue(new Error('password=secret'));
    const result = createAudit({ context, write }).log(input);
    await expect(result).rejects.toMatchObject({
      code: 'AUDIT_WRITE_FAILED',
      eventId: expect.any(String),
      message: 'AUDIT_WRITE_FAILED',
    });
    expect(write).toHaveBeenCalledOnce();
    await result.catch((error: unknown) =>
      expect(JSON.stringify(error)).not.toContain('secret'),
    );
  });
  it('maps an event once into a caller-owned repository', async () => {
    const createOne = vi.fn().mockResolvedValue({});
    const writer = createRepositoryAuditWriter({
      repository: { createOne },
      toValues: (event) => ({ key: event.id, action: event.action }),
    });
    await createAudit({ context, write: (event) => writer.write(event) }).log(
      input,
    );
    expect(createOne).toHaveBeenCalledExactlyOnceWith({
      values: { key: expect.any(String), action: input.action },
    });
  });
  it('writes concurrent JSONL records and recovers after a failed append', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'audit-writer-'));
    try {
      const path = join(directory, 'missing', 'audit.jsonl');
      const writer = createJsonlAuditWriter(path);
      const audit = createAudit({
        context,
        write: (event) => writer.write(event),
      });
      await expect(audit.log(input)).rejects.toMatchObject({
        code: 'AUDIT_WRITE_FAILED',
      });
      await mkdir(join(directory, 'missing'));
      await Promise.all(
        Array.from({ length: 24 }, (_, index) =>
          audit.log({ ...input, data: { index } }),
        ),
      );
      const events = (await readFile(path, 'utf8'))
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line) as AuditEvent);
      expect(events.map((event) => event.data.index)).toEqual(
        Array.from({ length: 24 }, (_, index) => index),
      );
      expect(new Set(events.map((event) => event.id)).size).toBe(24);
      expect(() => createJsonlAuditWriter('relative.jsonl')).toThrow(
        'absolute',
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
