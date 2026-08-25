import { readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { mkdtemp } from 'node:fs/promises';

import { Hono } from 'hono';
import { afterEach, describe, expect, it } from 'vitest';

import {
  createDatabaseManager,
  createMigrationContext,
  type DatabaseManager,
} from '@nocobase/app-database';
import {
  resolveFilesConfig,
  type FilesConfig,
} from '@nocobase/app-plugin-files/server';

import filesMigration from '../database/migrations/202608221000_files_create_files.js';
import type { FileUploadPlan } from '../client/types.js';
import { createFileCapabilityCodec } from '../server/internal/capability.js';
import {
  getFilesRuntimeDataPlane,
  getFilesRuntimeKernel,
  createOpaqueFilesRuntime,
} from '../server/internal/runtime.js';
import { FakeS3Disk } from './support/fake-s3-disk.js';

const secret = 'test-files-data-plane-secret-at-least-32-characters';
const basePath = '/api/files';

interface RequestInitWithDuplex extends RequestInit {
  duplex?: 'half';
}

interface TestRuntime {
  app: Hono;
  config: FilesConfig;
  database: DatabaseManager;
  dataPlane: ReturnType<typeof getFilesRuntimeDataPlane>;
  kernel: ReturnType<typeof getFilesRuntimeKernel>;
  runtime: ReturnType<typeof createOpaqueFilesRuntime>;
  storageRoot: string;
}

const activeRuntimes: TestRuntime[] = [];

afterEach(async () => {
  for (const fixture of activeRuntimes.splice(0)) {
    await fixture.runtime.dispose();
    await fixture.database.destroy();
    await rm(fixture.storageRoot, { recursive: true, force: true });
  }
});

describe('Files Local data plane', () => {
  it('mounts PUT/cancel/complete/content and keeps Local PUT pending', async () => {
    const fixture = await createTestRuntime();
    const plan = await fixture.dataPlane.createUploadPlan({
      name: 'quarterly\nreport.txt',
      size: 13,
      contentType: 'text/plain',
      constraints: {
        maxBytes: 32,
        allowedExtensions: ['.txt'],
        allowedContentTypes: ['text/plain'],
      },
    });

    expect(plan).toMatchObject({
      upload: {
        method: 'PUT',
        url: expect.stringMatching(/^\/api\/files\/.+\/upload\?access=/),
        headers: { 'content-type': 'text/plain' },
      },
      complete: {
        method: 'POST',
        url: expect.stringMatching(/^\/api\/files\/.+\/complete\?access=/),
      },
      cancel: {
        method: 'DELETE',
        url: expect.stringMatching(/^\/api\/files\/.+\/upload\?access=/),
      },
    });

    const upload = await fixture.app.request(plan.upload.url, {
      method: 'PUT',
      headers: plan.upload.headers,
      body: 'managed files',
    });
    expect(upload.status).toBe(200);
    await expect(upload.json()).resolves.toMatchObject({
      file: {
        id: plan.fileId,
        status: 'pending',
        size: null,
      },
    });
    await expect(fixture.kernel.getFile(plan.fileId)).resolves.toMatchObject({
      status: 'pending',
    });

    const complete = await fixture.app.request(plan.complete.url, {
      method: 'POST',
    });
    expect(complete.status).toBe(200);
    await expect(complete.json()).resolves.toMatchObject({
      file: {
        id: plan.fileId,
        status: 'ready',
        size: 13,
        contentType: 'text/plain',
      },
    });

    const access = await fixture.dataPlane.createReadAccess(
      plan.fileId,
      'attachment',
    );
    const head = await fixture.app.request(access.url, { method: 'HEAD' });
    expect(head.status).toBe(200);
    expect(head.body).toBeNull();
    expect(head.headers.get('content-length')).toBe('13');
    expect(head.headers.get('referrer-policy')).toBe('no-referrer');
    expect(head.headers.get('x-content-type-options')).toBe('nosniff');
    expect(head.headers.get('content-disposition')).toContain(
      'attachment; filename="quarterly_report.txt"',
    );
    expect(head.headers.get('content-disposition')).not.toContain('%0A');

    const content = await fixture.app.request(access.url);
    expect(content.status).toBe(200);
    expect(content.headers.get('content-type')).toBe('text/plain');
    await expect(content.text()).resolves.toBe('managed files');
  });

  it('cancels pending Local uploads through the Core route idempotently', async () => {
    const fixture = await createTestRuntime();
    const plan = await fixture.dataPlane.createUploadPlan({
      name: 'cancel.txt',
      size: 4,
      contentType: 'text/plain',
    });
    expect(
      (
        await fixture.app.request(plan.upload.url, {
          method: 'PUT',
          headers: plan.upload.headers,
          body: 'data',
        })
      ).status,
    ).toBe(200);

    expect(
      (await fixture.app.request(plan.cancel.url, { method: 'DELETE' })).status,
    ).toBe(200);
    expect(
      (await fixture.app.request(plan.cancel.url, { method: 'DELETE' })).status,
    ).toBe(200);
    await expect(fixture.kernel.getFile(plan.fileId)).resolves.toMatchObject({
      status: 'failed',
    });
    expect(await listFiles(fixture.storageRoot)).toEqual([]);
  });

  it('enforces the actual streaming byte limit without consuming the full body', async () => {
    const fixture = await createTestRuntime({ upload: { maxBytes: 1024 } });
    const plan = await fixture.dataPlane.createUploadPlan({
      name: 'bounded.bin',
      size: 1024,
    });
    let pulls = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        if (pulls > 100) {
          controller.close();
          return;
        }
        controller.enqueue(new Uint8Array(2048));
      },
    });

    const response = await streamRequest(fixture.app, plan.upload.url, body);
    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({
      error: 'The file exceeds the upload size limit.',
      code: 'UPLOAD_SIZE_EXCEEDED',
    });
    expect(pulls).toBeLessThan(100);
    expect(await listFiles(fixture.storageRoot)).toEqual([]);
    await expect(fixture.kernel.getFile(plan.fileId)).resolves.toMatchObject({
      status: 'pending',
    });
  });

  it('removes only the request candidate when actual size or MIME validation fails', async () => {
    const fixture = await createTestRuntime();
    const sizePlan = await fixture.dataPlane.createUploadPlan({
      name: 'size.txt',
      size: 5,
      contentType: 'text/plain',
    });
    const shortBody = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('four'));
        controller.close();
      },
    });
    const sizeResponse = await streamRequest(
      fixture.app,
      sizePlan.upload.url,
      shortBody,
      { 'content-type': 'text/plain' },
    );
    expect(sizeResponse.status).toBe(409);
    await expect(sizeResponse.json()).resolves.toMatchObject({
      code: 'UPLOAD_FAILED',
    });

    const typePlan = await fixture.dataPlane.createUploadPlan({
      name: 'type.txt',
      size: 4,
      contentType: 'text/plain',
      constraints: { allowedContentTypes: ['text/plain'] },
    });
    const typeResponse = await fixture.app.request(typePlan.upload.url, {
      method: 'PUT',
      headers: { 'content-type': 'text/html' },
      body: 'four',
    });
    expect(typeResponse.status).toBe(415);
    await expect(typeResponse.json()).resolves.toMatchObject({
      code: 'UPLOAD_TYPE_NOT_ALLOWED',
    });

    expect(await listFiles(fixture.storageRoot)).toEqual([]);
    await expect(
      fixture.kernel.getFile(sizePlan.fileId),
    ).resolves.toMatchObject({ status: 'pending' });
    await expect(
      fixture.kernel.getFile(typePlan.fileId),
    ).resolves.toMatchObject({ status: 'pending' });
  });

  it('rejects expired upload capabilities and pending content access', async () => {
    let now = new Date('2026-08-24T00:00:00.000Z');
    const fixture = await createTestRuntime(
      { upload: { expiresInSeconds: 1 } },
      { clock: () => now },
    );
    const plan = await fixture.dataPlane.createUploadPlan({
      name: 'expired.txt',
      size: 1,
    });
    const readAccess = new URL(plan.upload.url, 'http://localhost');
    readAccess.pathname = `${basePath}/${plan.fileId}/content`;
    const pendingContent = await fixture.app.request(
      `${readAccess.pathname}${readAccess.search}`,
    );
    expect(pendingContent.status).toBe(403);
    await expect(pendingContent.json()).resolves.toMatchObject({
      code: 'INVALID_ACCESS',
    });

    now = new Date('2026-08-24T00:00:02.000Z');
    const expired = await fixture.app.request(plan.upload.url, {
      method: 'PUT',
      body: 'x',
    });
    expect(expired.status).toBe(410);
    await expect(expired.json()).resolves.toMatchObject({
      code: 'UPLOAD_EXPIRED',
    });
  });

  it('maps missing and non-pending upload states to stable errors', async () => {
    const fixture = await createTestRuntime();
    const missingPlan = await fixture.dataPlane.createUploadPlan({
      name: 'missing.txt',
      size: 1,
    });
    await fixture.database
      .query()
      .deleteFrom('files')
      .where('id', '=', missingPlan.fileId)
      .execute();
    const missing = await fixture.app.request(missingPlan.upload.url, {
      method: 'PUT',
      body: 'x',
    });
    expect(missing.status).toBe(404);
    await expect(missing.json()).resolves.toMatchObject({
      code: 'FILE_NOT_FOUND',
    });

    const cancelledPlan = await fixture.dataPlane.createUploadPlan({
      name: 'cancelled.txt',
      size: 1,
    });
    const cancelledAccess = new URL(
      cancelledPlan.upload.url,
      'http://localhost',
    ).searchParams.get('access');
    if (!cancelledAccess) {
      throw new Error('Expected upload access credential.');
    }
    const capability = createFileCapabilityCodec({
      audience: 'test-app',
      secret,
    }).verify(
      { fileId: cancelledPlan.fileId, action: 'upload' },
      cancelledAccess,
    );
    if (capability.action !== 'upload') {
      throw new Error('Expected upload capability.');
    }
    await fixture.kernel.cancelUpload(cancelledPlan.fileId);
    const notReady = await fixture.app.request(cancelledPlan.upload.url, {
      method: 'PUT',
      body: 'x',
    });
    expect(notReady.status).toBe(409);
    await expect(notReady.json()).resolves.toMatchObject({
      code: 'FILE_NOT_READY',
    });
  });
});

describe('Files S3-compatible data plane', () => {
  it('redirects S3 GET while answering HEAD from stored metadata', async () => {
    const provider = new FakeS3Disk();
    const fixture = await createTestRuntime(
      {
        storage: { driver: 's3', bucket: 'managed-files' },
        access: { providerUrlExpiresInSeconds: 7 },
      },
      { disk: provider },
    );
    const plan = await fixture.dataPlane.createUploadPlan({
      name: 'report.pdf',
      size: 4,
      constraints: {
        allowedExtensions: ['.pdf'],
        allowedContentTypes: ['application/pdf'],
      },
    });

    expect(plan.upload).toMatchObject({
      method: 'PUT',
      url: expect.stringMatching(/^https:\/\/upload\.invalid\//),
    });
    expect(plan.complete).toMatchObject({
      method: 'POST',
      url: expect.stringMatching(/^\/api\/files\/.+\/complete\?access=/),
    });

    provider.putUpload(plan, {
      contentLength: 4,
      contentType: 'application/pdf',
    });
    const complete = await fixture.app.request(requiredCompleteUrl(plan), {
      method: 'POST',
    });
    expect(complete.status).toBe(200);
    await expect(complete.json()).resolves.toMatchObject({
      file: {
        id: plan.fileId,
        status: 'ready',
        size: 4,
        contentType: 'application/pdf',
      },
    });

    const access = await fixture.dataPlane.createReadAccess(plan.fileId);
    const head = await fixture.app.request(access.url, { method: 'HEAD' });
    expect(head.status).toBe(200);
    expect(head.headers.get('location')).toBeNull();
    expect(head.headers.get('content-length')).toBe('4');
    expect(head.headers.get('content-type')).toBe('application/pdf');
    expect(head.headers.get('x-content-type-options')).toBe('nosniff');
    expect(head.body).toBeNull();

    const get = await fixture.app.request(access.url);
    expect(get.status).toBe(302);
    expect(get.headers.get('location')).toMatch(/^https:\/\/read\.invalid\//);
    expect(get.headers.get('content-length')).toBeNull();
    expect(get.headers.get('referrer-policy')).toBe('no-referrer');
    expect(get.headers.get('x-content-type-options')).toBe('nosniff');
    expect(get.body).toBeNull();
    expect(provider.readOptions).toEqual([
      expect.objectContaining({
        expiresInSeconds: 7,
        cacheControl: 'private, no-store',
      }),
    ]);
  });

  it('resolves complete and cancel competition without leaving a ready object', async () => {
    const provider = new FakeS3Disk();
    const fixture = await createTestRuntime(
      { storage: { driver: 's3', bucket: 'managed-files' } },
      { disk: provider },
    );
    const attempt = await fixture.dataPlane.createUploadAttempt({
      name: 'race.bin',
      size: 4,
    });
    const plan = attempt.plan;
    provider.putUpload(plan, { contentLength: 4 });
    const pause = provider.pauseNextCopy();
    const completion = fixture.app.request(requiredCompleteUrl(plan), {
      method: 'POST',
    });
    await pause.started;

    await expect(
      fixture.kernel.cancelUpload(plan.fileId),
    ).resolves.toMatchObject({ outcome: 'failed' });
    pause.release();
    const response = await completion;
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: 'UPLOAD_FAILED',
    });
    await expect(fixture.kernel.getFile(plan.fileId)).resolves.toMatchObject({
      status: 'failed',
    });
    expect(provider.keys()).toEqual([]);
  });

  it('compensates rejected candidates and prevents old upload URLs from changing ready content', async () => {
    const provider = new FakeS3Disk();
    const fixture = await createTestRuntime(
      { storage: { driver: 's3', bucket: 'managed-files' } },
      { disk: provider },
    );
    const rejected = await fixture.dataPlane.createUploadPlan({
      name: 'rejected.txt',
      size: 4,
      constraints: { allowedContentTypes: ['text/plain'] },
    });
    const rejectedKey = provider.putUpload(rejected, {
      contentLength: 4,
      contentType: 'text/html',
    });
    const rejectedResponse = await fixture.app.request(
      requiredCompleteUrl(rejected),
      { method: 'POST' },
    );
    expect(rejectedResponse.status).toBe(415);
    await expect(rejectedResponse.json()).resolves.toMatchObject({
      code: 'UPLOAD_TYPE_NOT_ALLOWED',
    });
    expect(provider.has(rejectedKey)).toBe(false);

    const ready = await fixture.dataPlane.createUploadPlan({
      name: 'ready.txt',
      size: 5,
      contentType: 'text/plain',
    });
    const oldCandidateKey = provider.putUpload(ready, {
      contentLength: 5,
      contentType: 'text/plain',
      etag: 'first',
    });
    const first = await fixture.app.request(requiredCompleteUrl(ready), {
      method: 'POST',
    });
    expect(first.status).toBe(200);
    const storedBefore = await fixture.kernel.getRecord(ready.fileId);

    provider.put(oldCandidateKey, {
      contentLength: 999,
      contentType: 'application/octet-stream',
      etag: 'replacement',
    });
    const retry = await fixture.app.request(requiredCompleteUrl(ready), {
      method: 'POST',
    });
    expect(retry.status).toBe(200);
    const storedAfter = await fixture.kernel.getRecord(ready.fileId);
    expect(storedAfter).toMatchObject({
      storageKey: storedBefore?.storageKey,
      size: 5,
      contentType: 'text/plain',
    });
    expect(provider.has(oldCandidateKey)).toBe(false);
  });

  it('stores the normalized MIME after strict S3 metadata validation', async () => {
    const provider = new FakeS3Disk();
    const fixture = await createTestRuntime(
      { storage: { driver: 's3', bucket: 'managed-files' } },
      { disk: provider },
    );
    const plan = await fixture.dataPlane.createUploadPlan({
      name: 'normalized.txt',
      size: 4,
      contentType: 'text/plain',
      constraints: { allowedContentTypes: ['text/plain'] },
    });
    provider.putUpload(plan, {
      contentLength: 4,
      contentType: 'text/plain; charset=utf-8',
    });

    const response = await fixture.app.request(requiredCompleteUrl(plan), {
      method: 'POST',
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      file: { contentType: 'text/plain' },
    });
    await expect(fixture.kernel.getRecord(plan.fileId)).resolves.toMatchObject({
      contentType: 'text/plain',
    });
  });

  it('maps provider read failures without leaking the signed URL', async () => {
    const provider = new FakeS3Disk();
    const fixture = await createTestRuntime(
      { storage: { driver: 's3', bucket: 'managed-files' } },
      { disk: provider },
    );
    const plan = await fixture.dataPlane.createUploadPlan({
      name: 'unavailable.bin',
      size: 1,
    });
    provider.putUpload(plan, { contentLength: 1 });
    expect(
      (await fixture.app.request(requiredCompleteUrl(plan), { method: 'POST' }))
        .status,
    ).toBe(200);
    const access = await fixture.dataPlane.createReadAccess(plan.fileId);
    provider.failNextRead();

    const response = await fixture.app.request(access.url);
    expect(response.status).toBe(503);
    const responseBody = await response.text();
    expect(JSON.parse(responseBody)).toEqual({
      error: 'File storage is temporarily unavailable.',
      code: 'STORAGE_UNAVAILABLE',
    });
    expect(responseBody).not.toContain('signature=secret');
  });

  it('leaves unknown completion database errors to the App handler', async () => {
    const fixture = await createTestRuntime();
    const plan = await fixture.dataPlane.createUploadPlan({
      name: 'database-error.txt',
      size: 4,
      contentType: 'text/plain',
    });
    expect(
      (
        await fixture.app.request(plan.upload.url, {
          method: 'PUT',
          headers: plan.upload.headers,
          body: 'data',
        })
      ).status,
    ).toBe(200);
    fixture.app.onError((_error, context) =>
      context.json({ error: 'Internal Server Error' }, 500),
    );
    await fixture.database.builder().dropCollection('files');

    const response = await fixture.app.request(plan.complete.url, {
      method: 'POST',
    });
    const responseBody = await response.text();
    expect(response.status).toBe(500);
    expect(JSON.parse(responseBody)).toEqual({
      error: 'Internal Server Error',
    });
    expect(responseBody).not.toContain('no such table');
    expect(responseBody).not.toContain('STORAGE_UNAVAILABLE');
  });
});

describe.each(['local', 's3'] as const)(
  'Files %s completion retry contract',
  (driver) => {
    it('keeps the pending candidate when binding fails and retries the same plan', async () => {
      const provider = driver === 's3' ? new FakeS3Disk() : undefined;
      const fixture = await createTestRuntime(
        driver === 's3'
          ? { storage: { driver: 's3', bucket: 'managed-files' } }
          : {},
        provider === undefined ? {} : { disk: provider },
      );
      const attempt = await fixture.dataPlane.createUploadAttempt({
        name: 'retry.txt',
        size: 5,
        contentType: 'text/plain',
      });
      if (provider) {
        provider.putUpload(
          attempt.plan,
          {
            contentLength: 5,
            contentType: 'text/plain',
          },
          'retry',
        );
      } else {
        const response = await fixture.app.request(attempt.plan.upload.url, {
          method: 'PUT',
          headers: attempt.plan.upload.headers,
          body: 'retry',
        });
        expect(response.status).toBe(200);
      }

      let bindingAttempts = 0;
      const binding = {
        async commit(): Promise<string> {
          bindingAttempts += 1;
          if (bindingAttempts === 1) {
            throw new Error('simulated binding failure');
          }
          return 'bound';
        },
      };

      await expect(
        fixture.dataPlane.completeUpload(attempt.transfer, binding),
      ).rejects.toMatchObject({ code: 'UPLOAD_FAILED', status: 503 });
      await expect(
        fixture.kernel.getFile(attempt.file.id),
      ).resolves.toMatchObject({ status: 'pending' });

      await expect(
        fixture.dataPlane.completeUpload(attempt.transfer, binding),
      ).resolves.toMatchObject({
        file: { id: attempt.file.id, status: 'ready', size: 5 },
        binding: 'bound',
      });
      expect(bindingAttempts).toBe(2);
      await expect(
        fixture.kernel.getFile(attempt.file.id),
      ).resolves.toMatchObject({ status: 'ready' });
      await expect(
        readWebStream(
          (await fixture.dataPlane.openFile(attempt.file.id)).stream,
        ),
      ).resolves.toBe('retry');
    });

    it('removes retained candidates when a failed binding is explicitly cancelled', async () => {
      const provider = driver === 's3' ? new FakeS3Disk() : undefined;
      const fixture = await createTestRuntime(
        driver === 's3'
          ? { storage: { driver: 's3', bucket: 'managed-files' } }
          : {},
        provider === undefined ? {} : { disk: provider },
      );
      const attempt = await fixture.dataPlane.createUploadAttempt({
        name: 'cancel-after-failure.txt',
        size: 4,
        contentType: 'text/plain',
      });
      if (provider) {
        provider.putUpload(attempt.plan, {
          contentLength: 4,
          contentType: 'text/plain',
        });
      } else {
        expect(
          (
            await fixture.app.request(attempt.plan.upload.url, {
              method: 'PUT',
              headers: attempt.plan.upload.headers,
              body: 'data',
            })
          ).status,
        ).toBe(200);
      }

      await expect(
        fixture.dataPlane.completeUpload(attempt.transfer, {
          async commit(): Promise<void> {
            throw new Error('simulated binding failure');
          },
        }),
      ).rejects.toMatchObject({ code: 'UPLOAD_FAILED', status: 503 });
      await fixture.dataPlane.cancelUpload(attempt.transfer);

      await expect(
        fixture.kernel.getFile(attempt.file.id),
      ).resolves.toMatchObject({ status: 'failed' });
      await expect(
        fixture.dataPlane.openFile(attempt.file.id),
      ).rejects.toMatchObject({ code: 'FILE_NOT_READY' });
    });
  },
);

describe('Files Public Access kernel', () => {
  it('stores only hashes and invalidates tokens on reset and disable', async () => {
    const fixture = await createTestRuntime({
      publicAccess: { enabled: true },
    });
    const plan = await uploadLocalReady(fixture, 'public.txt', 'public text');

    const enabled = await fixture.dataPlane.enablePublicAccess(plan.fileId);
    expect(enabled).not.toHaveProperty('token');
    const state = await fixture.kernel.getPublicAccessState(plan.fileId);
    expect(state).toMatchObject({ disposition: 'attachment' });
    expect(state.tokenHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(enabled.url).not.toContain(state.tokenHash ?? '');
    expect((await fixture.app.request(enabled.url)).status).toBe(200);

    await expect(
      fixture.dataPlane.enablePublicAccess(plan.fileId),
    ).rejects.toMatchObject({ code: 'INVALID_ACCESS', status: 409 });
    const resets = await Promise.all([
      fixture.dataPlane.resetPublicAccess(plan.fileId),
      fixture.dataPlane.resetPublicAccess(plan.fileId),
    ]);
    expect(resets[0]?.url).not.toBe(resets[1]?.url);
    expect(resets[0]).not.toHaveProperty('token');
    expect(resets[1]).not.toHaveProperty('token');
    const oldToken = await fixture.app.request(enabled.url);
    expect(oldToken.status).toBe(403);
    await expect(oldToken.json()).resolves.toMatchObject({
      code: 'INVALID_ACCESS',
    });
    const resetStatuses = await Promise.all(
      resets.map(
        async (reset) => (await fixture.app.request(reset.url)).status,
      ),
    );
    const activeReset = resets[resetStatuses.indexOf(200)];
    expect([...resetStatuses].sort()).toEqual([200, 403]);
    if (!activeReset) {
      throw new Error('Expected exactly one active reset token.');
    }

    await fixture.dataPlane.disablePublicAccess(plan.fileId);
    await fixture.dataPlane.disablePublicAccess(plan.fileId);
    const disabled = await fixture.app.request(activeReset.url);
    expect(disabled.status).toBe(403);
    await expect(disabled.json()).resolves.toMatchObject({
      code: 'INVALID_ACCESS',
    });
  });

  it('rejects enable/reset when globally disabled and refuses active content inline', async () => {
    const disabledFixture = await createTestRuntime();
    const disabledPlan = await uploadLocalReady(
      disabledFixture,
      'disabled.txt',
      'text',
    );
    await expect(
      disabledFixture.dataPlane.enablePublicAccess(disabledPlan.fileId),
    ).rejects.toMatchObject({ code: 'PUBLIC_ACCESS_DISABLED' });
    await expect(
      disabledFixture.dataPlane.resetPublicAccess(disabledPlan.fileId),
    ).rejects.toMatchObject({ code: 'PUBLIC_ACCESS_DISABLED' });

    const enabledFixture = await createTestRuntime({
      publicAccess: { enabled: true },
    });
    const htmlPlan = await uploadLocalReady(
      enabledFixture,
      'page.html',
      '<script>x</script>',
      'text/html',
    );
    await expect(
      enabledFixture.dataPlane.enablePublicAccess(htmlPlan.fileId, 'inline'),
    ).rejects.toMatchObject({ code: 'INVALID_ACCESS' });
    await expect(
      enabledFixture.dataPlane.createReadAccess(htmlPlan.fileId, 'inline'),
    ).rejects.toMatchObject({ code: 'INVALID_ACCESS' });
  });

  it('documents the short residual lifetime of an issued S3 URL', async () => {
    const provider = new FakeS3Disk();
    const fixture = await createTestRuntime(
      {
        storage: { driver: 's3', bucket: 'managed-files' },
        access: { providerUrlExpiresInSeconds: 3 },
        publicAccess: { enabled: true },
      },
      { disk: provider },
    );
    const plan = await fixture.dataPlane.createUploadPlan({
      name: 'public.pdf',
      size: 4,
      contentType: 'application/pdf',
    });
    provider.putUpload(plan, {
      contentLength: 4,
      contentType: 'application/pdf',
    });
    const complete = await fixture.app.request(requiredCompleteUrl(plan), {
      method: 'POST',
    });
    expect(complete.status).toBe(200);

    const publicAccess = await fixture.dataPlane.enablePublicAccess(
      plan.fileId,
    );
    const redirect = await fixture.app.request(publicAccess.url);
    const issuedProviderUrl = redirect.headers.get('location');
    expect(redirect.status).toBe(302);
    expect(issuedProviderUrl).toMatch(/^https:\/\/read\.invalid\//);
    expect(provider.readOptions.at(-1)?.expiresInSeconds).toBe(3);

    await fixture.dataPlane.disablePublicAccess(plan.fileId);
    expect((await fixture.app.request(publicAccess.url)).status).toBe(403);
    expect(issuedProviderUrl).toBeTruthy();
  });
});

async function createTestRuntime(
  configOverrides: Record<string, unknown> = {},
  internalOptions: Parameters<typeof createOpaqueFilesRuntime>[1] = {},
): Promise<TestRuntime> {
  const database = createDatabaseManager({
    default: 'sqlite',
    connections: {
      sqlite: {
        dialect: 'sqlite',
        driver: 'better-sqlite3',
        filename: ':memory:',
      },
    },
  });
  await filesMigration.up(createMigrationContext(database.connection()));
  const storageRoot = await mkdtemp(path.join(tmpdir(), 'files-data-plane-'));
  const config = resolveFilesConfig({
    appStorageRoot: storageRoot,
    config: configOverrides,
  });
  const runtime = createOpaqueFilesRuntime(
    {
      database,
      config,
      audience: 'test-app',
      secret,
    },
    { basePath, ...internalOptions },
  );
  const dataPlane = getFilesRuntimeDataPlane(runtime);
  const app = new Hono();
  app.route(basePath, dataPlane.createRoute());
  const fixture = {
    app,
    config,
    database,
    dataPlane,
    kernel: getFilesRuntimeKernel(runtime),
    runtime,
    storageRoot,
  };
  activeRuntimes.push(fixture);
  return fixture;
}

async function uploadLocalReady(
  fixture: TestRuntime,
  name: string,
  contents: string,
  contentType = 'text/plain',
): Promise<FileUploadPlan> {
  const size = new TextEncoder().encode(contents).byteLength;
  const plan = await fixture.dataPlane.createUploadPlan({
    name,
    size,
    contentType,
  });
  const response = await fixture.app.request(plan.upload.url, {
    method: 'PUT',
    headers: plan.upload.headers,
    body: contents,
  });
  if (!response.ok) {
    throw new Error(
      `Expected Local upload to succeed: ${await response.text()}`,
    );
  }
  const complete = await fixture.app.request(plan.complete.url, {
    method: 'POST',
  });
  if (!complete.ok) {
    throw new Error(
      `Expected Local completion to succeed: ${await complete.text()}`,
    );
  }
  return plan;
}

async function streamRequest(
  app: Hono,
  url: string,
  body: ReadableStream<Uint8Array>,
  headers?: HeadersInit,
): Promise<Response> {
  const init: RequestInitWithDuplex = {
    method: 'PUT',
    body,
    duplex: 'half',
    ...(headers === undefined ? {} : { headers }),
  };
  return app.fetch(new Request(`http://localhost${url}`, init));
}

async function listFiles(root: string): Promise<string[]> {
  const result: string[] = [];
  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(entryPath);
      } else {
        result.push(path.relative(root, entryPath));
      }
    }
  }
  await visit(root);
  return result.sort();
}

function requiredCompleteUrl(plan: FileUploadPlan): string {
  return plan.complete.url;
}

async function readWebStream(
  stream: ReadableStream<Uint8Array>,
): Promise<string> {
  return new Response(stream).text();
}
