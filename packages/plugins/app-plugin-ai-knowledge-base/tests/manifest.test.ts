import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';

import { DriveFileStorageFactory } from '@nocobase/ai-employee';
import {
  createDatabaseManager,
  InMemoryCollectionMetadataStore,
  type DatabaseManager,
} from '@nocobase/db';
import { createDriveManager, type NocoBaseDriveManager } from '@nocobase/drive';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import createKnowledgeBaseMigration from '../database/migrations/202608260001_create_ai_knowledge_base.js';
import storageMigration from '../database/migrations/202609010001_replace_knowledge_base_storage_id_with_disk.js';
import inlineVectorConfigMigration from '../database/migrations/202609020001_inline_knowledge_base_vector_config.js';
import manifestPersistenceMigration from '../database/migrations/202609050001_create_ai_knowledge_base_manifests.js';
import { KnowledgeBaseRepositoryFactory } from '../server/factories/repository-factory.js';
import { KnowledgeBaseManifestBootstrapper } from '../server/manifest-bootstrap.js';
import type {
  KnowledgeBaseManifest,
  KnowledgeBaseManifestService,
  KnowledgeBaseManifestSource,
} from '../server/manifest.js';
import {
  normalizeManifestLocation,
  normalizeManifestSource,
  parseKnowledgeBaseManifest,
} from '../server/manifest-schema.js';
import { KnowledgeBaseDocumentManager } from '../server/managers/knowledge-base-document-manager.js';
import { KnowledgeBaseManager } from '../server/managers/knowledge-base-manager.js';
import { KnowledgeBaseStorageManager } from '../server/managers/knowledge-base-storage-manager.js';
import type { KnowledgeBaseEntity } from '../server/repository/index.js';
import { DefaultKnowledgeBaseManifestService } from '../server/services/knowledge-base-manifest-service.js';

const warningLogger = { warn: vi.fn() };
const initConfig = {
  disk: 'target',
  name: 'Manuals',
  vectorDatabase: 'vector-db',
  llmService: 'llm-service',
  embeddingModel: 'embedding-model',
} as const;

describe('knowledge base Manifest schema', () => {
  it('normalizes strict disk-relative manifests and rejects invalid shapes', () => {
    expect(
      parseKnowledgeBaseManifest({
        key: ' manuals ',
        operation: 'init',
        initiate: { ...initConfig, name: ' Manuals ' },
        files: [
          {
            disk: ' source ',
            locations: [' /docs/guide.pdf ', 'docs\\faq.md'],
          },
        ],
      }),
    ).toEqual({
      key: 'manuals',
      operation: 'init',
      initiate: { ...initConfig, name: 'Manuals' },
      files: [{ disk: 'source', locations: ['docs/guide.pdf', 'docs/faq.md'] }],
    });

    expect(() =>
      parseKnowledgeBaseManifest({
        key: 'manuals',
        operation: 'init',
        files: [{ disk: 'source', locations: ['docs/guide.pdf'] }],
      }),
    ).toThrow(/initiate.*required/i);
    expect(() =>
      parseKnowledgeBaseManifest({
        key: 'manuals',
        operation: 'append',
        files: [
          {
            disk: 'source',
            locations: ['/docs/guide.pdf', 'docs/./guide.pdf'],
          },
        ],
      }),
    ).toThrow(/duplicate file disk\/location/i);
    for (const escaped of ['../outside.pdf', '..\\outside.pdf']) {
      expect(() =>
        parseKnowledgeBaseManifest({
          key: 'manuals',
          operation: 'append',
          files: [{ disk: 'source', locations: [escaped] }],
        }),
      ).toThrow(/stay within its Drive disk/i);
    }
    expect(() =>
      parseKnowledgeBaseManifest({
        key: 'manuals',
        operation: 'append',
        files: [{ disk: 'source', locations: ['docs/guide.pdf'] }],
        unexpected: true,
      }),
    ).toThrow();
  });

  it('normalizes and validates exact Manifest source identities', () => {
    expect(normalizeManifestLocation(' /manifests/./base.yml ')).toBe(
      'manifests/base.yml',
    );
    expect(
      normalizeManifestSource({
        disk: ' config ',
        location: '/manifests/base.yml',
      }),
    ).toEqual({ disk: 'config', location: 'manifests/base.yml' });
    expect(() =>
      normalizeManifestSource({ disk: 'config', location: '../base.yml' }),
    ).toThrow(/stay within its Drive disk/i);
    expect(() =>
      normalizeManifestSource(null as unknown as KnowledgeBaseManifestSource),
    ).toThrow(/must be an object/i);
  });
});

describe('knowledge base Manifest Drive reads', () => {
  let localRoot: string | undefined;

  afterEach(async () => {
    if (localRoot) await rm(localRoot, { recursive: true, force: true });
    localRoot = undefined;
  });

  it('reads a local Drive location relative to the configured disk root', async () => {
    localRoot = await mkdtemp(path.join(tmpdir(), 'nocobase-kb-manifest-'));
    await writeFile(
      path.join(localRoot, 'nested.yml'),
      [
        'key: manuals',
        'operation: append',
        'files:',
        '  - disk: source',
        '    locations:',
        '      - docs/guide.pdf',
      ].join('\n'),
    );
    const drive = createDriveManager({
      default: 'config',
      disks: {
        config: {
          driver: 'fs',
          location: localRoot,
          visibility: 'private',
        },
      },
    });
    const apply = vi.fn().mockResolvedValue([]);
    const bootstrapper = createBootstrapper(drive, apply);

    await bootstrapper.apply([{ disk: 'config', locations: ['/nested.yml'] }]);

    expect(apply).toHaveBeenCalledWith([
      {
        source: { disk: 'config', location: 'nested.yml' },
        manifest: appendManifest('docs/guide.pdf'),
      },
    ]);
  });

  it('reads simulated object storage streams and permanently skips SUCCESS sources', async () => {
    const getStream = vi.fn(async (key: string) => {
      expect(key).toBe('manifests/base.yml');
      return Readable.from([
        Buffer.from('key: manuals\noperation: append\nfiles:\n'),
        '  - disk: source\n    locations: [docs/guide.pdf]\n',
      ]);
    });
    const drive = {
      use: vi.fn(() => ({ getStream })),
    } as unknown as NocoBaseDriveManager;
    const apply = vi.fn().mockResolvedValue([]);
    const bootstrapper = createBootstrapper(drive, apply);

    await bootstrapper.apply([
      { disk: 'objects', locations: ['/manifests/base.yml'] },
    ]);

    expect(getStream).toHaveBeenCalledOnce();
    expect(apply).toHaveBeenCalledExactlyOnceWith([
      {
        source: { disk: 'objects', location: 'manifests/base.yml' },
        manifest: appendManifest('docs/guide.pdf'),
      },
    ]);

    const skipped = createBootstrapper(drive, apply, 'SUCCESS');
    await skipped.apply([
      { disk: 'objects', locations: ['manifests/base.yml'] },
    ]);
    expect(getStream).toHaveBeenCalledOnce();
    expect(apply).toHaveBeenCalledOnce();
  });

  it('resumes an unfinished source from its persisted snapshot without rereading YAML', async () => {
    const getStream = vi.fn(async () => {
      throw new Error('Manifest object is no longer available');
    });
    const drive = {
      use: vi.fn(() => ({ getStream })),
    } as unknown as NocoBaseDriveManager;
    const apply = vi.fn().mockResolvedValue([]);
    const snapshot = appendManifest('docs/guide.pdf');
    const bootstrapper = createBootstrapper(drive, apply, 'FAILED', snapshot);

    await bootstrapper.apply([
      { disk: 'objects', locations: ['/manifests/base.yml'] },
    ]);

    expect(getStream).not.toHaveBeenCalled();
    expect(apply).toHaveBeenCalledExactlyOnceWith([
      {
        source: { disk: 'objects', location: 'manifests/base.yml' },
        manifest: snapshot,
      },
    ]);
  });

  it('warns and continues when one configured source is invalid', async () => {
    const drive = {
      use: vi.fn(() => ({
        getStream: vi.fn(async () =>
          Readable.from([
            'key: manuals\noperation: append\nfiles: [{disk: source, locations: [docs/guide.pdf]}]',
          ]),
        ),
      })),
    } as unknown as NocoBaseDriveManager;
    const apply = vi.fn().mockResolvedValue([]);
    const bootstrapper = createBootstrapper(drive, apply);

    await bootstrapper.apply([
      { disk: 'objects', locations: ['../invalid.yml', 'valid.yml'] },
    ]);

    expect(warningLogger.warn).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ sourceLocation: '../invalid.yml' }),
    );
    expect(apply).toHaveBeenCalledOnce();
  });
});

describe('DefaultKnowledgeBaseManifestService', () => {
  let harness: Awaited<ReturnType<typeof createHarness>>;

  beforeEach(async () => {
    warningLogger.warn.mockReset();
    harness = await createHarness();
  });

  afterEach(async () => {
    await harness.database.destroy();
  });

  it('applies init, append, identical recover, and changed recover', async () => {
    harness.put('source', 'docs/guide.pdf', 'version one');
    harness.put('source', 'docs/faq.md', 'faq');

    const [initialized] = await harness.service.apply([
      input('manifests/init.yml', initManifest('docs/guide.pdf')),
    ]);
    const [appended] = await harness.service.apply([
      input('manifests/append.yml', appendManifest('docs/faq.md')),
    ]);

    expect(initialized).toMatchObject({
      operation: 'init',
      status: 'SUCCESS',
      knowledgeBaseKey: 'manuals',
      knowledgeBaseId: expect.anything(),
      files: [
        expect.objectContaining({
          sourceDisk: 'source',
          sourceLocation: 'docs/guide.pdf',
          status: 'SUCCESS',
          contentHash: sha256('version one'),
        }),
      ],
    });
    expect(appended).toMatchObject({ operation: 'append', status: 'SUCCESS' });
    expect(await harness.repositories.documents.count()).toBe(2);
    expect(harness.dispatch).toHaveBeenCalledTimes(2);

    const original = initialized.files[0];
    const [identical] = await harness.service.apply([
      input(
        'manifests/recover-identical.yml',
        recoverManifest('docs/guide.pdf'),
      ),
    ]);
    expect(identical).toMatchObject({
      operation: 'recover',
      status: 'SUCCESS',
    });
    expect(identical.files[0]).toMatchObject({
      documentId: original.documentId,
      documentKey: original.documentKey,
      contentHash: original.contentHash,
    });
    expect(harness.cleanup).not.toHaveBeenCalled();
    expect(harness.replace).not.toHaveBeenCalled();
    expect(harness.dispatch).toHaveBeenCalledTimes(2);

    harness.put('source', 'docs/guide.pdf', 'version two');
    const [changed] = await harness.service.apply([
      input('manifests/recover-changed.yml', recoverManifest('docs/guide.pdf')),
    ]);
    expect(changed).toMatchObject({ operation: 'recover', status: 'SUCCESS' });
    expect(changed.files[0]).toMatchObject({
      documentId: original.documentId,
      documentKey: original.documentKey,
      contentHash: sha256('version two'),
    });
    expect(harness.cleanup).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ key: 'manuals' }),
      [original.documentId],
    );
    expect(harness.replace).toHaveBeenCalledOnce();
    expect(harness.dispatch).toHaveBeenCalledTimes(3);
    const persisted = await harness.repositories.documents.findById(
      original.documentId!,
    );
    expect(persisted).toMatchObject({
      id: original.documentId,
      key: original.documentKey,
      filename: 'guide.pdf',
      size: Buffer.byteLength('version two'),
    });
    expect(
      Buffer.from(harness.object(persisted!.disk, persisted!.path)!).toString(),
    ).toBe('version two');
  });

  it('requires exact disk and location identity for recover mappings', async () => {
    harness.put('source', 'docs/guide.pdf', 'guide');
    await harness.service.apply([
      input('manifests/init.yml', initManifest('docs/guide.pdf')),
    ]);
    harness.put('other-source', 'docs/guide.pdf', 'guide');

    const [record] = await harness.service.apply([
      input(
        'manifests/recover.yml',
        recoverManifest('docs/guide.pdf', 'other-source'),
      ),
    ]);

    expect(record).toMatchObject({ status: 'FAILED' });
    expect(record.files[0]).toMatchObject({
      sourceDisk: 'other-source',
      sourceLocation: 'docs/guide.pdf',
      status: 'FAILED',
      failureReason: expect.stringMatching(/No successful document mapping/),
    });
  });

  it.each(['append', 'recover'] as const)(
    'returns a FAILED record when a %s target is missing',
    async (operation) => {
      harness.put('source', 'docs/guide.pdf', 'guide');
      const manifest =
        operation === 'append'
          ? appendManifest('docs/guide.pdf', 'missing')
          : recoverManifest('docs/guide.pdf', 'source', 'missing');

      await expect(
        harness.service.apply([input(`manifests/${operation}.yml`, manifest)]),
      ).resolves.toMatchObject([
        {
          status: 'FAILED',
          errorMessage: expect.stringMatching(/missing.*not found/i),
        },
      ]);
    },
  );

  it.each(['append', 'recover'] as const)(
    'rejects a non-LOCAL %s target without processing files',
    async (operation) => {
      await harness.createBase('manuals', 'READONLY');
      harness.put('source', 'docs/guide.pdf', 'guide');
      const manifest =
        operation === 'append'
          ? appendManifest('docs/guide.pdf')
          : recoverManifest('docs/guide.pdf');

      const [record] = await harness.service.apply([
        input(`manifests/${operation}.yml`, manifest),
      ]);

      expect(record).toMatchObject({
        status: 'FAILED',
        errorMessage: expect.stringMatching(/require a LOCAL knowledge base/i),
      });
      expect(record.files[0]).toMatchObject({ status: 'PENDING' });
      expect(harness.store).not.toHaveBeenCalled();
    },
  );

  it('reports an init key conflict without adopting the existing base', async () => {
    await harness.createBase('manuals');
    harness.put('source', 'docs/guide.pdf', 'guide');

    const [record] = await harness.service.apply([
      input('manifests/conflict.yml', initManifest('docs/guide.pdf')),
    ]);

    expect(record).toMatchObject({
      status: 'FAILED',
      knowledgeBaseId: null,
      errorMessage: expect.stringMatching(/already in use/i),
    });
    expect(harness.store).not.toHaveBeenCalled();
  });

  it('treats a successful source as permanent and preserves exact hashes', async () => {
    harness.put('source', 'docs/guide.pdf', 'guide bytes');
    const manifest = initManifest('docs/guide.pdf');
    const [first] = await harness.service.apply([
      input('/manifests/./init.yml', manifest),
    ]);
    const changedInput = initManifest('docs/ignored.md');
    harness.put('source', 'docs/ignored.md', 'ignored');

    const [second] = await harness.service.apply([
      input('manifests/init.yml', changedInput),
    ]);

    const canonical =
      '{"files":[{"disk":"source","locations":["docs/guide.pdf"]}],"initiate":{"disk":"target","embeddingModel":"embedding-model","llmService":"llm-service","name":"Manuals","vectorDatabase":"vector-db"},"key":"manuals","operation":"init"}';
    expect(first.manifestHash).toBe(sha256(canonical));
    expect(first.files[0].contentHash).toBe(sha256('guide bytes'));
    expect(second).toEqual(first);
    expect(harness.getStream).toHaveBeenCalledTimes(1);
    expect(harness.store).toHaveBeenCalledTimes(1);
  });

  it('uses both disk and location as the exact permanent Manifest source identity', async () => {
    await harness.createBase('manuals');
    harness.put('source', 'docs/a.pdf', 'a');
    harness.put('source', 'docs/b.pdf', 'b');

    const [first] = await harness.service.apply([
      input('manifests/shared.yml', appendManifest('docs/a.pdf'), 'config-a'),
    ]);
    const [second] = await harness.service.apply([
      input('/manifests/shared.yml', appendManifest('docs/b.pdf'), 'config-b'),
    ]);

    expect(second.id).not.toBe(first.id);
    expect(await harness.repositories.manifests.count()).toBe(2);
    expect(await harness.repositories.documents.count()).toBe(2);
    expect(first.files[0].contentHash).toBe(sha256('a'));
    expect(second.files[0].contentHash).toBe(sha256('b'));
  });

  it('recovers only failed files after init has already created its base', async () => {
    harness.put('source', 'docs/a.pdf', 'a');
    const manifest = initManifest('docs/a.pdf', 'docs/b.pdf');

    const [failed] = await harness.service.apply([
      input('manifests/init-partial.yml', manifest),
    ]);

    expect(failed).toMatchObject({
      status: 'FAILED',
      knowledgeBaseId: expect.anything(),
      files: [
        expect.objectContaining({
          sourceLocation: 'docs/a.pdf',
          status: 'SUCCESS',
          attemptCount: 1,
        }),
        expect.objectContaining({
          sourceLocation: 'docs/b.pdf',
          status: 'FAILED',
          attemptCount: 1,
        }),
      ],
    });
    expect(await harness.repositories.knowledgeBases.count()).toBe(1);
    expect(harness.store).toHaveBeenCalledTimes(1);

    harness.put('source', 'docs/b.pdf', 'b');
    const [recovered] = await harness.service.apply([
      input('manifests/init-partial.yml', manifest),
    ]);

    expect(recovered).toMatchObject({
      status: 'SUCCESS',
      attemptCount: 2,
      knowledgeBaseId: failed.knowledgeBaseId,
      files: [
        expect.objectContaining({
          sourceLocation: 'docs/a.pdf',
          status: 'SUCCESS',
          attemptCount: 1,
        }),
        expect.objectContaining({
          sourceLocation: 'docs/b.pdf',
          status: 'SUCCESS',
          attemptCount: 2,
        }),
      ],
    });
    expect(await harness.repositories.knowledgeBases.count()).toBe(1);
    expect(harness.store).toHaveBeenCalledTimes(2);
  });

  it('reconstructs file-only state for an interrupted init record after base creation', async () => {
    const base = await harness.createBase('manuals');
    harness.put('source', 'docs/guide.pdf', 'guide');
    const manifest = initManifest('docs/guide.pdf');
    const interrupted = await harness.repositories.manifests.create(
      {
        sourceDisk: 'config',
        sourceLocation: 'manifests/interrupted.yml',
        knowledgeBaseKey: manifest.key,
        knowledgeBaseId: base.id,
        operation: manifest.operation,
        status: 'PROCESSING',
        manifestHash: '0'.repeat(64),
        manifestSnapshot: manifest,
        attemptCount: 1,
        startedAt: new Date(),
        finishedAt: null,
        errorMessage: null,
      },
      {
        sourceDisk: 'config',
        sourceLocation: 'manifests/interrupted.yml',
      },
    );

    await harness.repositories.vectorDatabases.update(
      { key: 'vector-db' },
      { enabled: false },
    );
    harness.getLLMService.mockRejectedValue(
      new Error('LLM lookup should not run for an already-created init base'),
    );

    const [record] = await harness.service.apply([
      input('manifests/interrupted.yml', manifest),
    ]);

    expect(record).toMatchObject({
      id: interrupted.id,
      status: 'SUCCESS',
      knowledgeBaseId: base.id,
      attemptCount: 2,
      files: [
        expect.objectContaining({
          sourceLocation: 'docs/guide.pdf',
          status: 'SUCCESS',
        }),
      ],
    });
    expect(harness.store).toHaveBeenCalledOnce();
    expect(harness.getLLMService).not.toHaveBeenCalled();
  });
  it('adopts the exact init base created before knowledgeBaseId persistence', async () => {
    harness.put('source', 'docs/guide.pdf', 'guide');
    const manifest = initManifest('docs/guide.pdf');
    const interrupted = await harness.repositories.manifests.create(
      {
        sourceDisk: 'config',
        sourceLocation: 'manifests/create-gap.yml',
        knowledgeBaseKey: manifest.key,
        knowledgeBaseId: null,
        operation: manifest.operation,
        status: 'PROCESSING',
        manifestHash: '0'.repeat(64),
        manifestSnapshot: manifest,
        attemptCount: 1,
        startedAt: new Date(),
        finishedAt: null,
        errorMessage: null,
      },
      {
        sourceDisk: 'config',
        sourceLocation: 'manifests/create-gap.yml',
      },
    );
    const base = await harness.repositories.knowledgeBases.create({
      key: manifest.key,
      name: 'Manuals',
      knowledgeBaseType: 'LOCAL',
      knowledgeBaseOuterId: `manifest:${interrupted.id}`,
      vectorStoreProvider: 'NocobaseLocalVectorStore',
      disk: 'target',
      vectorDatabaseKey: 'vector-db',
      llmService: 'llm-service',
      embeddingModel: 'embedding-model',
      vectorStoreConfigHash: 'hash',
      vectorStoreUpdatedAt: new Date(),
      segmentOptions: { enabled: true, chunkSize: 6000, chunkOverlap: 1200 },
      documentCount: 0,
      characterCount: 0,
      aiEmployeeCount: 0,
      enabled: true,
    });

    const [record] = await harness.service.apply([
      input('manifests/create-gap.yml', manifest),
    ]);

    expect(record).toMatchObject({
      id: interrupted.id,
      status: 'SUCCESS',
      knowledgeBaseId: base.id,
    });
    expect(await harness.repositories.knowledgeBases.count()).toBe(1);
    expect(harness.store).toHaveBeenCalledOnce();
  });

  it('reuses an interrupted file mapping instead of storing a duplicate document', async () => {
    await harness.createBase('manuals');
    harness.put('source', 'docs/guide.pdf', 'guide');
    harness.dispatch.mockRejectedValueOnce(new Error('queue unavailable'));
    const manifest = appendManifest('docs/guide.pdf');

    const [failed] = await harness.service.apply([
      input('manifests/interrupted-file.yml', manifest),
    ]);
    expect(failed).toMatchObject({
      status: 'FAILED',
      files: [
        expect.objectContaining({
          status: 'FAILED',
          documentId: expect.anything(),
          documentKey: expect.anything(),
          contentHash: sha256('guide'),
        }),
      ],
    });

    const [recovered] = await harness.service.apply([
      input('manifests/interrupted-file.yml', manifest),
    ]);

    expect(recovered).toMatchObject({
      status: 'SUCCESS',
      files: [
        expect.objectContaining({
          documentId: failed.files[0].documentId,
          documentKey: failed.files[0].documentKey,
          attemptCount: 2,
        }),
      ],
    });
    expect(harness.store).toHaveBeenCalledOnce();
    expect(await harness.repositories.documents.count()).toBe(1);
    expect(harness.dispatch).toHaveBeenCalledTimes(2);
  });

  it('resumes an interrupted changed recover without replacing or cleaning twice', async () => {
    harness.put('source', 'docs/guide.pdf', 'version one');
    const [initialized] = await harness.service.apply([
      input('manifests/init.yml', initManifest('docs/guide.pdf')),
    ]);
    const original = initialized.files[0];
    harness.put('source', 'docs/guide.pdf', 'version two');
    harness.dispatch.mockRejectedValueOnce(new Error('queue unavailable'));
    const manifest = recoverManifest('docs/guide.pdf');

    const [failed] = await harness.service.apply([
      input('manifests/recover-interrupted.yml', manifest),
    ]);
    expect(failed).toMatchObject({
      status: 'FAILED',
      files: [
        expect.objectContaining({
          status: 'FAILED',
          documentId: original.documentId,
          documentKey: original.documentKey,
          contentHash: sha256('version two'),
        }),
      ],
    });
    expect(harness.cleanup).toHaveBeenCalledTimes(1);
    expect(harness.replace).toHaveBeenCalledTimes(1);

    const [recovered] = await harness.service.apply([
      input('manifests/recover-interrupted.yml', manifest),
    ]);

    expect(recovered).toMatchObject({
      status: 'SUCCESS',
      files: [
        expect.objectContaining({
          documentId: original.documentId,
          documentKey: original.documentKey,
          attemptCount: 2,
        }),
      ],
    });
    expect(harness.cleanup).toHaveBeenCalledTimes(1);
    expect(harness.replace).toHaveBeenCalledTimes(1);
    expect(harness.dispatch).toHaveBeenCalledTimes(3);
  });

  it('returns records with successful and failed file details for partial failures', async () => {
    await harness.createBase('manuals');
    harness.put('source', 'docs/a.pdf', 'a');

    await expect(
      harness.service.apply([
        input(
          'manifests/partial.yml',
          appendManifest('docs/a.pdf', 'manuals', 'docs/missing.pdf'),
        ),
      ]),
    ).resolves.toMatchObject([
      {
        status: 'FAILED',
        errorMessage: expect.stringContaining('docs/missing.pdf'),
        files: [
          expect.objectContaining({
            sourceLocation: 'docs/a.pdf',
            status: 'SUCCESS',
          }),
          expect.objectContaining({
            sourceLocation: 'docs/missing.pdf',
            status: 'FAILED',
            failureReason: expect.any(String),
          }),
        ],
      },
    ]);
    expect(warningLogger.warn).toHaveBeenCalledWith(
      expect.stringMatching(/file import failed/i),
      expect.objectContaining({ sourceLocation: 'docs/missing.pdf' }),
    );
  });

  it('serializes same-source concurrency and exposes deterministic state order', async () => {
    await harness.createBase('manuals');
    harness.put('source', 'docs/z.pdf', 'z');
    harness.put('source', 'docs/a.pdf', 'a');
    const manifest = appendManifest('docs/z.pdf', 'manuals', 'docs/a.pdf');
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    harness.getStream.mockImplementationOnce(async () => {
      await gate;
      return Readable.from([Buffer.from('z')]);
    });

    const first = harness.service.apply([
      input('manifests/concurrent.yml', manifest),
    ]);
    const second = harness.service.apply([
      input('/manifests/./concurrent.yml', manifest),
    ]);
    await vi.waitFor(() => expect(harness.getStream).toHaveBeenCalledOnce());
    release?.();
    const [[firstRecord], [secondRecord]] = await Promise.all([first, second]);

    expect(secondRecord.id).toBe(firstRecord.id);
    expect(await harness.repositories.manifests.count()).toBe(1);
    expect(await harness.repositories.documents.count()).toBe(2);
    expect(harness.store).toHaveBeenCalledTimes(2);

    harness.put('source', 'docs/other.pdf', 'other');
    const [otherRecord] = await harness.service.apply([
      input('manifests/other.yml', appendManifest('docs/other.pdf')),
    ]);
    const state = await harness.service.state([
      otherRecord.id,
      firstRecord.id,
      otherRecord.id,
    ]);
    expect(state.map(({ id }) => Number(id))).toEqual(
      [firstRecord.id, otherRecord.id]
        .map(Number)
        .sort((left, right) => left - right),
    );
    expect(state.find(({ id }) => id === firstRecord.id)?.files).toMatchObject([
      { sourceLocation: 'docs/a.pdf' },
      { sourceLocation: 'docs/z.pdf' },
    ]);
    await expect(harness.service.state([])).resolves.toEqual([]);
  });
});

function createBootstrapper(
  drive: NocoBaseDriveManager,
  apply: ReturnType<typeof vi.fn>,
  status?: string,
  manifestSnapshot?: KnowledgeBaseManifest,
): KnowledgeBaseManifestBootstrapper {
  return new KnowledgeBaseManifestBootstrapper(
    drive,
    {
      manifests: {
        findOne: vi
          .fn()
          .mockResolvedValue(status ? { status, manifestSnapshot } : null),
      },
    } as never,
    { apply, state: vi.fn() } as unknown as KnowledgeBaseManifestService,
    warningLogger,
  );
}

async function createHarness() {
  const database = createDatabaseManager({
    default: 'main',
    metadataStore: new InMemoryCollectionMetadataStore(),
    connections: { main: { dialect: 'sqlite', filename: ':memory:' } },
  });
  await migrateUp(database);
  const repositories = new KnowledgeBaseRepositoryFactory(
    database.connection(),
  );
  await repositories.vectorDatabases.create({
    key: 'vector-db',
    name: 'Vector database',
    databaseSpec: 'PGVector',
    provider: 'NocobaseDefaultPGVectorProvider',
    connectProps: {},
    managedBy: null,
    enabled: true,
  });

  const objects = new Map<string, Uint8Array>();
  const objectKey = (disk: string, location: string) => `${disk}\0${location}`;
  const getStream = vi.fn(async (disk: string, location: string) => {
    const value = objects.get(objectKey(disk, location));
    if (!value) throw new Error(`Object ${disk}:${location} not found`);
    return Readable.from([Buffer.from(value)]);
  });
  const drive = {
    ['use']: (disk: string) => ({
      put: async (location: string, content: Uint8Array) => {
        objects.set(objectKey(disk, location), Uint8Array.from(content));
      },
      getStream: (location: string) => getStream(disk, location),
      getUrl: async (location: string) => `/${disk}/${location}`,
      delete: async (location: string) => {
        objects.delete(objectKey(disk, location));
      },
    }),
  };
  const knowledgeBases = new KnowledgeBaseManager(
    repositories.knowledgeBases,
    repositories.documents,
    ['target'],
  );
  const storage = new KnowledgeBaseStorageManager(
    new DriveFileStorageFactory(drive),
    repositories.documents,
    repositories.segmentShards,
    ['target'],
    warningLogger,
  );
  const dispatch = vi.fn().mockResolvedValue(undefined);
  const documents = new KnowledgeBaseDocumentManager(
    repositories.knowledgeBases,
    repositories.documents,
    repositories.segments,
    repositories.segmentShards,
    knowledgeBases,
    storage,
    { dispatch },
    warningLogger,
  );
  const store = vi.spyOn(documents, 'storeDocument');
  const replace = vi.spyOn(documents, 'replaceDocumentForRecovery');
  const cleanup = vi.fn().mockResolvedValue(undefined);
  const managers = {
    knowledgeBases,
    documents,
    vectorCleanup: { deleteDocumentVectors: cleanup },
  };
  const getLLMService = vi.fn().mockResolvedValue({ enabled: true });
  const ai = {
    llmServiceManager: { getLLMService },
  };
  const service = new DefaultKnowledgeBaseManifestService(
    ai as never,
    drive as unknown as NocoBaseDriveManager,
    repositories,
    managers as never,
    warningLogger,
  );

  return {
    database,
    repositories,
    service,
    getStream,
    dispatch,
    store,
    replace,
    cleanup,
    getLLMService,
    put(disk: string, location: string, content: string): void {
      objects.set(objectKey(disk, location), Buffer.from(content));
    },
    object(disk: string, location: string): Uint8Array | undefined {
      return objects.get(objectKey(disk, location));
    },
    createBase(
      key: string,
      knowledgeBaseType: KnowledgeBaseEntity['knowledgeBaseType'] = 'LOCAL',
    ): Promise<KnowledgeBaseEntity> {
      return knowledgeBases.create({
        key,
        name: key,
        knowledgeBaseType,
        disk: 'target',
        vectorDatabaseKey: 'vector-db',
        llmService: 'llm-service',
        embeddingModel: 'embedding-model',
        enabled: true,
      });
    },
  };
}

function input(
  location: string,
  manifest: KnowledgeBaseManifest,
  disk = 'config',
): { source: KnowledgeBaseManifestSource; manifest: KnowledgeBaseManifest } {
  return { source: { disk, location }, manifest };
}

function initManifest(...locations: string[]): KnowledgeBaseManifest {
  return {
    key: 'manuals',
    operation: 'init',
    initiate: initConfig,
    files: [{ disk: 'source', locations }],
  };
}

function appendManifest(
  location: string,
  key = 'manuals',
  ...additionalLocations: string[]
): KnowledgeBaseManifest {
  return {
    key,
    operation: 'append',
    files: [{ disk: 'source', locations: [location, ...additionalLocations] }],
  };
}

function recoverManifest(
  location: string,
  disk = 'source',
  key = 'manuals',
): KnowledgeBaseManifest {
  return {
    key,
    operation: 'recover',
    files: [{ disk, locations: [location] }],
  };
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

async function migrateUp(database: DatabaseManager): Promise<void> {
  await database.connect();
  const connection = database.connection();
  const context = {
    builder: connection.builder,
    query: connection.query,
    connection,
  };
  await createKnowledgeBaseMigration.up(context);
  await storageMigration.up(context);
  await inlineVectorConfigMigration.up(context);
  await manifestPersistenceMigration.up(context);
}
