import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDriveManager } from '@nocobase/drive';
import { describe, expect, it, vi } from 'vitest';
import {
  createAudit,
  type AuditEvent,
  type AuditWriter,
} from '../src/index.js';
import { createDriveAuditWriter } from '../src/writers/drive.js';

function bind(writer: AuditWriter, appName: string = 'crm') {
  return createAudit({
    context: () => ({
      appName,
      actor: { type: 'service', id: 'importer' },
      source: { type: 'script' },
    }),
    write: (event) => writer.write(event),
  });
}

describe('Drive audit output', () => {
  it('keeps concurrent events from separate writers in distinct private objects on a real FS disk', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'audit-drive-'));
    try {
      const drive = createDriveManager({
        default: 'local',
        disks: {
          local: { driver: 'fs', location: directory, visibility: 'private' },
        },
      });
      const audits = [0, 1].map(() =>
        bind(createDriveAuditWriter({ disk: drive.use('local') }), '../客户'),
      );
      await Promise.all(
        Array.from({ length: 24 }, (_, index) =>
          audits[index % 2]!.log({
            action: 'customer.updated',
            result: 'success',
            data: { index, phone: '139****5678' },
          }),
        ),
      );
      const files = (await readdir(directory, { recursive: true })).filter(
        (name) => name.endsWith('.jsonl'),
      );
      expect(files).toHaveLength(24);
      const events: AuditEvent[] = [];
      for (const file of files) {
        expect(file.startsWith('audit/Li4v5a6i5oi3/')).toBe(true);
        const contents = await readFile(join(directory, file), 'utf8');
        expect(contents.endsWith('\n')).toBe(true);
        expect(contents.trim().split('\n')).toHaveLength(1);
        events.push(JSON.parse(contents) as AuditEvent);
        expect(await drive.use('local').getVisibility(file)).toBe('private');
      }
      expect(new Set(events.map((event) => event.id)).size).toBe(24);
      expect(
        events
          .map((event) => event.data.index)
          .sort((a, b) => Number(a) - Number(b)),
      ).toEqual(Array.from({ length: 24 }, (_, index) => index));
      expect(events.every((event) => event.appName === '../客户')).toBe(true);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('sends real S3 PUT requests using the configured disk and recovers after an access denial', async () => {
    const requests: {
      method: string | undefined;
      path: string;
      acl: unknown;
      contentType: unknown;
      body: string;
    }[] = [];
    let deny = false;
    const server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        requests.push({
          method: req.method,
          path: req.url ?? '',
          acl: req.headers['x-amz-acl'],
          contentType: req.headers['content-type'],
          body: Buffer.concat(chunks).toString('utf8'),
        });
        if (deny) {
          res.writeHead(403, { 'Content-Type': 'application/xml' });
          res.end(
            '<Error><Code>AccessDenied</Code><Message>private backend detail</Message></Error>',
          );
        } else {
          res.writeHead(200, { ETag: '"fixture"' });
          res.end();
        }
      });
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    try {
      const address = server.address();
      if (!address || typeof address === 'string')
        throw new Error('Missing test port.');
      const drive = createDriveManager({
        default: 'archive',
        disks: {
          archive: {
            driver: 's3',
            bucket: 'audit-test',
            region: 'us-east-1',
            endpoint: `http://127.0.0.1:${address.port}`,
            forcePathStyle: true,
            supportsACL: true,
            credentials: {
              accessKeyId: 'test-key',
              secretAccessKey: 'test-secret',
            },
            visibility: 'public',
          },
        },
      });
      const audit = bind(
        createDriveAuditWriter({
          disk: drive.use('archive'),
          prefix: 'logs/business',
        }),
      );
      const input = { action: 'customer.updated', result: 'success' } as const;
      await Promise.all(Array.from({ length: 4 }, () => audit.log(input)));
      expect(requests).toHaveLength(4);
      expect(new Set(requests.map((request) => request.path)).size).toBe(4);
      for (const request of requests) {
        expect(request.method).toBe('PUT');
        expect(request.path).toMatch(
          /^\/audit-test\/logs\/business\/Y3Jt\/\d{4}\/\d{2}\/\d{2}\/[a-f0-9-]+\.jsonl/,
        );
        expect(request.acl).toBe('private');
        expect(request.contentType).toBe('application/x-ndjson');
        expect(JSON.parse(request.body)).toMatchObject({
          appName: 'crm',
          action: input.action,
          actor: { id: 'importer' },
        });
      }
      deny = true;
      await expect(audit.log(input)).rejects.toMatchObject({
        code: 'AUDIT_WRITE_FAILED',
        message: 'AUDIT_WRITE_FAILED',
      });
      expect(requests).toHaveLength(5);
      deny = false;
      await audit.log(input);
      expect(requests).toHaveLength(6);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });

  it('waits for storage acknowledgement without buffering or reading an existing object', async () => {
    const gate = Promise.withResolvers<void>();
    const put = vi.fn(() => gate.promise);
    const audit = bind(createDriveAuditWriter({ disk: { put } }));
    const settled = vi.fn();
    const pending = audit
      .log({ action: 'customer.updated', result: 'success' })
      .then(settled);
    await Promise.resolve();
    expect(put).toHaveBeenCalledOnce();
    expect(settled).not.toHaveBeenCalled();
    gate.resolve();
    await pending;
    expect(settled).toHaveBeenCalledOnce();
  });

  it.each([
    '',
    '/audit',
    '../audit',
    'audit/../outside',
    '.../outside',
    '.audit',
    'audit//logs',
    'audit/',
    'C:\\audit',
  ])('rejects an unsafe object prefix: %s', (prefix) => {
    const put = vi.fn();
    expect(() => createDriveAuditWriter({ disk: { put }, prefix })).toThrow(
      'safe relative',
    );
    expect(put).not.toHaveBeenCalled();
  });
});
