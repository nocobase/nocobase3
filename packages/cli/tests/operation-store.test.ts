import { createHash } from 'node:crypto';
import {
  chmod,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  LocalOperationError,
  cacheOperationArtifact,
  createOperation,
  loadOperation,
  pruneExpiredOperations,
  resolveCliRoot,
  updateOperation,
  verifyCachedOperationArtifact,
} from '../src/lib/operation-store.ts';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { force: true, recursive: true })),
  );
});

async function createRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'nb3-operation-test-'));
  roots.push(root);
  return root;
}

function sha256(content: string): string {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`;
}

describe('operation journal', () => {
  it('uses the configured global CLI root', () => {
    expect(resolveCliRoot({ NB3_CLI_ROOT: '/tmp/custom-nb3-root' })).toBe(
      '/tmp/custom-nb3-root',
    );
  });

  it('persists resumable state without secrets and uses private atomic files', async () => {
    const root = await createRoot();
    const operationId = 'f88e4663-6d60-48f4-8703-8af26a9305e2';

    await createOperation(
      {
        kind: 'app-publish',
        operationId,
        hubUrl: 'https://hub.example.com/hub',
        idempotencyKey: operationId,
        step: 'initialized',
      },
      { root },
    );
    await updateOperation(
      operationId,
      (operation) => ({
        ...operation,
        resourceIds: { applicationId: 'app-1', uploadId: 'upload-1' },
        release: {
          version: '1.4.0',
          sourceCommit: 'a'.repeat(40),
          checksum: sha256('artifact'),
          sizeBytes: 8,
          archiveChecksum: sha256('archive'),
          archiveSizeBytes: 7,
          manifest: { schemaVersion: 1, basePath: '/sales' },
        },
        step: 'upload-created',
      }),
      { root },
    );

    const resumed = await loadOperation(operationId, { root });
    expect(resumed).toMatchObject({
      kind: 'app-publish',
      operationId,
      hubUrl: 'https://hub.example.com/hub',
      idempotencyKey: operationId,
      resourceIds: { applicationId: 'app-1', uploadId: 'upload-1' },
      release: {
        version: '1.4.0',
        sourceCommit: 'a'.repeat(40),
        checksum: sha256('artifact'),
        sizeBytes: 8,
        archiveChecksum: sha256('archive'),
        archiveSizeBytes: 7,
        manifest: { schemaVersion: 1, basePath: '/sales' },
      },
      step: 'upload-created',
    });

    const journalPath = path.join(root, 'operations', `${operationId}.json`);
    const raw = await readFile(journalPath, 'utf8');
    expect(raw).not.toContain('token');
    expect(raw).not.toContain('runtimeSecret');
    expect((await stat(journalPath)).mode & 0o777).toBe(0o600);
    expect(
      (await readdir(path.dirname(journalPath))).filter((entry) =>
        entry.includes('.tmp-'),
      ),
    ).toEqual([]);
  });

  it('returns existing state when the same operation ID is resumed', async () => {
    const root = await createRoot();
    const operationId = 'resume-operation';
    await createOperation(
      {
        kind: 'app-publish',
        operationId,
        hubUrl: 'https://hub.example.com/hub',
        idempotencyKey: operationId,
        step: 'initialized',
      },
      { root },
    );
    await updateOperation(
      operationId,
      (operation) => ({
        ...operation,
        hubUrl: 'https://other.example.com/hub',
        idempotencyKey: 'different-key',
        step: 'content-uploaded',
      }),
      { root },
    );

    const resumed = await createOperation(
      {
        kind: 'app-publish',
        operationId,
        hubUrl: 'https://hub.example.com/hub',
        idempotencyKey: operationId,
        step: 'initialized',
      },
      { root },
    );

    expect(resumed.step).toBe('content-uploaded');
    expect(resumed.hubUrl).toBe('https://hub.example.com/hub');
    expect(resumed.idempotencyKey).toBe(operationId);
  });

  it('does not reuse an operation ID for a different Hub request', async () => {
    const root = await createRoot();
    const operationId = 'scoped-operation';
    await createOperation(
      {
        kind: 'app-publish',
        operationId,
        hubUrl: 'https://hub.example.com/hub',
        idempotencyKey: operationId,
        step: 'initialized',
      },
      { root },
    );

    await expect(
      createOperation(
        {
          kind: 'app-publish',
          operationId,
          hubUrl: 'https://other.example.com/hub',
          idempotencyKey: operationId,
          step: 'initialized',
        },
        { root },
      ),
    ).rejects.toMatchObject({ code: 'LOCAL_OPERATION_INVALID' });
  });

  it('does not reuse an operation ID across command workflows', async () => {
    const root = await createRoot();
    const operationId = 'workflow-operation';
    await createOperation(
      {
        kind: 'app-publish',
        operationId,
        hubUrl: 'https://hub.example.com/hub',
        idempotencyKey: operationId,
        step: 'initialized',
      },
      { root },
    );

    await expect(
      createOperation(
        {
          kind: 'app-deploy',
          operationId,
          hubUrl: 'https://hub.example.com/hub',
          idempotencyKey: operationId,
          step: 'initialized',
        },
        { root },
      ),
    ).rejects.toMatchObject({ code: 'LOCAL_OPERATION_INVALID' });
  });

  it('does not resume an operation with different command parameters', async () => {
    const root = await createRoot();
    const operationId = 'parameter-scoped-operation';
    await createOperation(
      {
        kind: 'app-publish',
        operationId,
        hubUrl: 'https://hub.example.com/hub',
        idempotencyKey: operationId,
        parameters: {
          bump: 'none',
          deploy: 'false',
          dryRun: 'false',
          version: '1.0.0',
        },
        step: 'initialized',
      },
      { root },
    );

    await expect(
      createOperation(
        {
          kind: 'app-publish',
          operationId,
          hubUrl: 'https://hub.example.com/hub',
          idempotencyKey: operationId,
          parameters: {
            bump: 'none',
            deploy: 'false',
            dryRun: 'false',
            version: '2.0.0',
          },
          step: 'initialized',
        },
        { root },
      ),
    ).rejects.toMatchObject({
      code: 'LOCAL_OPERATION_INVALID',
      message: expect.stringContaining('different command parameters'),
    });
  });

  it('prunes expired journals and their controlled artifact cache', async () => {
    const root = await createRoot();
    const operationId = 'completed-operation';
    const old = new Date('2026-01-01T00:00:00.000Z');
    await createOperation(
      {
        kind: 'app-publish',
        operationId,
        hubUrl: 'https://hub.example.com/hub',
        idempotencyKey: operationId,
        step: 'completed',
      },
      { root, now: () => old },
    );
    const cacheDirectory = path.join(root, 'operation-cache', operationId);
    await (
      await import('node:fs/promises')
    ).mkdir(cacheDirectory, {
      recursive: true,
    });
    await writeFile(path.join(cacheDirectory, 'release.tar.gz'), 'old');

    const result = await pruneExpiredOperations({
      root,
      now: () => new Date('2026-01-09T00:00:00.000Z'),
    });

    expect(result).toEqual({ pruned: 1 });
    expect(await loadOperation(operationId, { root })).toBeUndefined();
    await expect(stat(cacheDirectory)).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('eventually prunes abandoned non-terminal operations', async () => {
    const root = await createRoot();
    await createOperation(
      {
        kind: 'app-publish',
        operationId: 'abandoned-operation',
        hubUrl: 'https://hub.example.com/hub',
        idempotencyKey: 'abandoned-operation',
        step: 'upload-created',
      },
      { root, now: () => new Date('2026-01-01T00:00:00.000Z') },
    );

    const result = await pruneExpiredOperations({
      root,
      now: () => new Date('2026-02-01T00:00:00.000Z'),
    });

    expect(result).toEqual({ pruned: 1 });
    expect(
      await loadOperation('abandoned-operation', { root }),
    ).toBeUndefined();
  });

  it('rejects secret-shaped journal fields', async () => {
    const root = await createRoot();

    await expect(
      createOperation(
        {
          kind: 'app-publish',
          operationId: 'operation-with-secret',
          hubUrl: 'https://hub.example.com/hub',
          idempotencyKey: 'operation-with-secret',
          step: 'initialized',
          runtimeSecret: 'must-not-be-written',
        } as never,
        { root },
      ),
    ).rejects.toMatchObject({ code: 'LOCAL_OPERATION_SECRET_REJECTED' });
  });
});

describe('operation artifact cache', () => {
  it('copies an artifact into the controlled cache with mode 0600', async () => {
    const root = await createRoot();
    const operationId = 'operation-cache';
    const source = path.join(root, 'release.tar.gz');
    const content = 'release archive bytes';
    await writeFile(source, content);
    await chmod(source, 0o644);
    await createOperation(
      {
        kind: 'app-publish',
        operationId,
        hubUrl: 'https://hub.example.com/hub',
        idempotencyKey: operationId,
        step: 'built',
      },
      { root },
    );

    const cached = await cacheOperationArtifact(
      operationId,
      source,
      sha256(content),
      { root },
    );

    expect(cached.path).toBe(
      path.join(root, 'operation-cache', operationId, 'release.tar.gz'),
    );
    expect(cached.checksum).toBe(sha256(content));
    expect(await readFile(cached.path, 'utf8')).toBe(content);
    expect((await stat(cached.path)).mode & 0o777).toBe(0o600);
    expect((await loadOperation(operationId, { root }))?.artifact).toEqual(
      cached,
    );
  });

  it('reports a missing cached artifact with an actionable error code', async () => {
    const root = await createRoot();
    const operationId = 'operation-missing';
    await createOperation(
      {
        kind: 'app-publish',
        operationId,
        hubUrl: 'https://hub.example.com/hub',
        idempotencyKey: operationId,
        step: 'upload-created',
        artifact: {
          path: path.join(
            root,
            'operation-cache',
            operationId,
            'release.tar.gz',
          ),
          checksum: sha256('missing'),
        },
      },
      { root },
    );

    await expect(
      verifyCachedOperationArtifact(operationId, { root }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<LocalOperationError>>({
        code: 'LOCAL_OPERATION_ARTIFACT_MISSING',
      }),
    );
  });

  it('detects when cached bytes change before an upload is resumed', async () => {
    const root = await createRoot();
    const operationId = 'operation-changed';
    const source = path.join(root, 'release.tar.gz');
    await writeFile(source, 'original');
    await createOperation(
      {
        kind: 'app-publish',
        operationId,
        hubUrl: 'https://hub.example.com/hub',
        idempotencyKey: operationId,
        step: 'built',
      },
      { root },
    );
    const cached = await cacheOperationArtifact(
      operationId,
      source,
      sha256('original'),
      { root },
    );
    await writeFile(cached.path, 'replacement');

    await expect(
      verifyCachedOperationArtifact(operationId, { root }),
    ).rejects.toMatchObject({ code: 'LOCAL_OPERATION_ARTIFACT_CHANGED' });
  });
});
