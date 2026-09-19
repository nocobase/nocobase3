import { ServiceContainer } from '@nocobase/service-provider';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Application } from '@nocobase/app-server/application';
import { AppConfig, createAppPaths } from '@nocobase/app-server/config';
import { DriveProvider, driveManagerToken } from '@nocobase/app-server/drive';
import { describe, expect, it, vi } from 'vitest';
import { AuditError, type AuditEvent, type AuditInput } from '@nocobase/audit';
import { createDriveAuditWriter } from '@nocobase/audit/writers/drive';
import { AuditProvider } from '../server/providers/audit.js';
import { createAppAudit } from '../server/services/audit.js';
import { logAuditBestEffort } from '../server/diagnostics.js';
import {
  auditServiceToken,
  type AuditConfig,
  type AppAuditContext,
} from '../server/tokens.js';

const input: AuditInput = { action: 'customer.updated', result: 'success' };
const context: AppAuditContext = {
  actor: { type: 'user', id: 'alice' },
  source: { type: 'http' },
};
async function fixture(audit?: AuditConfig) {
  const config = new AppConfig();
  await config.loadAll();
  config.mergeDefaults({ app: { name: 'host' }, ...(audit ? { audit } : {}) });
  const app = new Application({
    config,
    paths: createAppPaths({ rootDir: '/tmp/audit-provider-test' }),
  });
  const provider = new AuditProvider(app);
  provider.register();
  return { app, provider, service: app.container.resolve(auditServiceToken) };
}

describe('App audit binding and lifetime', () => {
  it('writes through the host-configured Drive disk without disposing the shared manager', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'app-audit-drive-'));
    const { app, provider, service } = await fixture({
      createWriter: (services) => ({
        writer: createDriveAuditWriter({
          disk: services.resolve(driveManagerToken).use('archive'),
        }),
      }),
    });
    app.config.mergeDefaults({
      drive: {
        default: 'archive',
        disks: {
          archive: { driver: 'fs', location: directory, visibility: 'private' },
        },
      },
    });
    const driveProvider = new DriveProvider(app);
    try {
      driveProvider.register();
      await driveProvider.boot();
      await provider.boot();
      await service.for(context).log(input);
      await provider.shutdown();
      const files = (await readdir(directory, { recursive: true })).filter(
        (file) => file.endsWith('.jsonl'),
      );
      expect(files).toHaveLength(1);
      expect(
        JSON.parse(await readFile(join(directory, files[0]!), 'utf8')),
      ).toMatchObject({
        appName: 'host',
        actor: context.actor,
        source: context.source,
        action: input.action,
      });
      await app.container
        .resolve(driveManagerToken)
        .use('archive')
        .put('still-available.txt', 'ok');
      expect(
        await readFile(join(directory, 'still-available.txt'), 'utf8'),
      ).toBe('ok');
    } finally {
      await provider.shutdown();
      await driveProvider.shutdown();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('isolates concurrent identities and snapshots each for call', async () => {
    const events: AuditEvent[] = [];
    const appAudit = createAppAudit('host', {
      write: async (event) => {
        await Promise.resolve();
        events.push(event);
      },
    });
    const original = {
      ...context,
      actor: { type: 'user', id: 'alice' },
      source: { type: 'http', requestId: 'r1' },
    };
    const alice = appAudit.for({
      ...original,
      appName: 'forged',
    } as AppAuditContext);
    original.actor.id = 'forged';
    original.source.requestId = 'forged';
    const bob = appAudit.for({
      actor: { type: 'user', id: 'bob' },
      source: { type: 'ws', messageId: 'm2' },
    });
    await Promise.all([alice.log(input), bob.log(input)]);
    expect(events).toMatchObject([
      { appName: 'host', actor: { id: 'alice' }, source: { requestId: 'r1' } },
      { appName: 'host', actor: { id: 'bob' }, source: { messageId: 'm2' } },
    ]);
  });
  it('fails visibly when writer configuration is missing', async () => {
    const { provider, service } = await fixture();
    expect(() => service.for(context)).toThrow('not ready');
    await expect(provider.boot()).rejects.toThrow('createWriter');
    await provider.shutdown();
  });
  it('drains admitted writes then disposes owned resources once', async () => {
    const gate = Promise.withResolvers<void>();
    const dispose = vi.fn();
    const write = vi.fn(() => gate.promise);
    const createWriter = vi.fn(() => ({ writer: { write }, dispose }));
    const { provider, service, app } = await fixture({ createWriter });
    await provider.boot();
    expect(createWriter).toHaveBeenCalledExactlyOnceWith(app.container);
    const bound = service.for(context);
    const pending = bound.log(input);
    const closing = provider.shutdown();
    expect(dispose).not.toHaveBeenCalled();
    expect(() => service.for(context)).toThrow('not ready');
    await expect(bound.log(input)).rejects.toMatchObject({
      code: 'AUDIT_WRITE_FAILED',
    });
    gate.resolve();
    await pending;
    await closing;
    await provider.shutdown();
    expect(write).toHaveBeenCalledOnce();
    expect(dispose).toHaveBeenCalledOnce();
  });
  it('disposes even after an admitted output rejects', async () => {
    const dispose = vi.fn();
    const { provider, service } = await fixture({
      createWriter: () => ({
        writer: {
          write: async () => {
            throw new Error('backend');
          },
        },
        dispose,
      }),
    });
    await provider.boot();
    await expect(service.for(context).log(input)).rejects.toMatchObject({
      code: 'AUDIT_WRITE_FAILED',
    });
    await provider.shutdown();
    expect(dispose).toHaveBeenCalledOnce();
  });
  it('uses the original token identity', () => {
    const container = new ServiceContainer();
    const audit = createAppAudit('host', { write: async () => undefined });
    container.instance(auditServiceToken, audit);
    expect(container.resolve(auditServiceToken)).toBe(audit);
  });
  it.each([
    new AuditError('AUDIT_WRITE_FAILED', 'event-1'),
    new Error('private database input'),
  ])(
    'reports only safe diagnostics and contains reporter failure',
    async (error) => {
      const log = vi.fn().mockRejectedValue(error);
      const report = vi.fn().mockRejectedValue(new Error('reporter failed'));
      await expect(
        logAuditBestEffort({ log }, input, report),
      ).resolves.toBeUndefined();
      expect(log).toHaveBeenCalledOnce();
      expect(report).toHaveBeenCalledOnce();
      expect(report.mock.calls[0]?.[0]).toEqual(
        error instanceof AuditError
          ? { code: 'AUDIT_WRITE_FAILED', eventId: 'event-1' }
          : { code: 'AUDIT_UNEXPECTED_FAILURE' },
      );
    },
  );
});
