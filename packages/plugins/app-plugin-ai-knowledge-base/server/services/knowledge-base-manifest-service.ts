import { createHash } from 'node:crypto';
import path from 'node:path';

import type { AIManager } from '@nocobase/ai-employee';
import type { NocoBaseDriveManager } from '@nocobase/drive';

import type { KnowledgeBaseManagerFactory } from '../factories/manager-factory.js';
import type { KnowledgeBaseRepositoryFactory } from '../factories/repository-factory.js';
import type { KnowledgeBaseWarningLogger } from '../internal-types.js';
import type {
  KnowledgeBaseManifest,
  KnowledgeBaseManifestApplyInput,
  KnowledgeBaseManifestService,
  ManifestFileRecord,
  ManifestRecord,
} from '../manifest.js';
import {
  normalizeManifestLocation,
  normalizeManifestSource,
  parseKnowledgeBaseManifest,
} from '../manifest-schema.js';
import type {
  KnowledgeBaseDocumentEntity,
  KnowledgeBaseManifestEntity,
  KnowledgeBaseManifestFileEntity,
} from '../repository/index.js';

export class DefaultKnowledgeBaseManifestService implements KnowledgeBaseManifestService {
  private readonly sourceQueues = new Map<string, Promise<ManifestRecord>>();

  public constructor(
    private readonly ai: AIManager,
    private readonly drive: NocoBaseDriveManager,
    private readonly repositories: KnowledgeBaseRepositoryFactory,
    private readonly managers: KnowledgeBaseManagerFactory,
    private readonly warningLogger: KnowledgeBaseWarningLogger,
  ) {}

  public async apply(
    inputs: readonly KnowledgeBaseManifestApplyInput[],
  ): Promise<readonly ManifestRecord[]> {
    const manifestInputs = inputs;
    if (!Array.isArray(inputs))
      throw new Error('Manifest inputs must be an array.');
    const normalized = manifestInputs.map((input) => ({
      source: normalizeManifestSource(input.source),
      manifest: parseKnowledgeBaseManifest(input.manifest),
    }));
    return Promise.all(normalized.map((input) => this.enqueue(input)));
  }

  public async state(
    manifestRecordIds: readonly (string | number)[],
  ): Promise<readonly ManifestRecord[]> {
    if (!Array.isArray(manifestRecordIds)) {
      throw new Error('Manifest record ids must be an array.');
    }
    if (!manifestRecordIds.length) return [];
    const records = await this.repositories.manifests.find({
      filter: { id: { $in: manifestRecordIds } },
      sort: ['id'],
    });
    return Promise.all(records.map((record) => this.toRecord(record)));
  }

  private enqueue(
    input: KnowledgeBaseManifestApplyInput,
  ): Promise<ManifestRecord> {
    const identity = `${input.source.disk}\0${input.source.location}`;
    const previous =
      this.sourceQueues.get(identity) ?? Promise.resolve(undefined);
    const operation = previous
      .catch(() => undefined)
      .then(() => this.applyOne(input));
    this.sourceQueues.set(identity, operation);
    operation
      .finally(() => {
        if (this.sourceQueues.get(identity) === operation) {
          this.sourceQueues.delete(identity);
        }
      })
      .catch(() => undefined);
    return operation;
  }

  private async applyOne(
    input: KnowledgeBaseManifestApplyInput,
  ): Promise<ManifestRecord> {
    let record = await this.repositories.manifests.findOne({
      sourceDisk: input.source.disk,
      sourceLocation: input.source.location,
    });
    if (record?.status === 'SUCCESS') return this.toRecord(record);

    if (!record) {
      const manifestHash = hashBytes(
        Buffer.from(stableJson(input.manifest), 'utf8'),
      );
      record = await this.repositories.manifests.create(
        {
          sourceDisk: input.source.disk,
          sourceLocation: input.source.location,
          knowledgeBaseKey: input.manifest.key,
          knowledgeBaseId: null,
          operation: input.manifest.operation,
          status: 'PENDING',
          manifestHash,
          manifestSnapshot: input.manifest,
          attemptCount: 0,
          startedAt: null,
          finishedAt: null,
          errorMessage: null,
        },
        {
          sourceDisk: input.source.disk,
          sourceLocation: input.source.location,
        },
      );
    }

    const manifest = parseKnowledgeBaseManifest(record.manifestSnapshot);
    await this.repositories.manifests.update(
      { id: record.id },
      {
        status: 'PROCESSING',
        attemptCount: Number(record.attemptCount ?? 0) + 1,
        startedAt: new Date(),
        finishedAt: null,
        errorMessage: null,
      },
    );

    try {
      const files = await this.ensureManifestFiles(record.id, manifest);
      const base = await this.prepareTarget(record, manifest);
      const failures: string[] = [];
      for (const file of files) {
        if (file.status === 'SUCCESS') continue;
        try {
          await this.processFile(record, manifest, base, file);
        } catch (cause) {
          const message = errorMessage(cause);
          failures.push(
            `${file.sourceDisk}:${file.sourceLocation}: ${message}`,
          );
          await this.repositories.manifestFiles.update(
            { id: file.id },
            { status: 'FAILED', failureReason: message },
          );
          this.warningLogger.warn(
            'Knowledge base Manifest file import failed.',
            {
              manifestRecordId: record.id,
              sourceDisk: file.sourceDisk,
              sourceLocation: file.sourceLocation,
              knowledgeBaseKey: manifest.key,
              operation: manifest.operation,
              error: cause,
            },
          );
        }
      }
      await this.managers.documents.refreshStatistics(manifest.key);
      await this.repositories.manifests.update(
        { id: record.id },
        failures.length
          ? {
              status: 'FAILED',
              finishedAt: new Date(),
              errorMessage: failures.join('\n'),
            }
          : {
              status: 'SUCCESS',
              finishedAt: new Date(),
              errorMessage: null,
            },
      );
    } catch (cause) {
      const message = errorMessage(cause);
      await this.repositories.manifests.update(
        { id: record.id },
        { status: 'FAILED', finishedAt: new Date(), errorMessage: message },
      );
      this.warningLogger.warn('Knowledge base Manifest processing failed.', {
        manifestRecordId: record.id,
        sourceDisk: record.sourceDisk,
        sourceLocation: record.sourceLocation,
        knowledgeBaseKey: manifest.key,
        operation: manifest.operation,
        error: cause,
      });
    }

    const persisted = await this.repositories.manifests.findById(record.id);
    if (!persisted)
      throw new Error('Manifest processing record could not be read.');
    return this.toRecord(persisted);
  }

  private async prepareTarget(
    record: KnowledgeBaseManifestEntity,
    manifest: KnowledgeBaseManifest,
  ) {
    const existing = await this.repositories.knowledgeBases.findOne({
      key: manifest.key,
    });
    if (manifest.operation !== 'init') {
      if (!existing)
        throw new Error(`Knowledge base #${manifest.key} not found`);
      if (existing.knowledgeBaseType !== 'LOCAL') {
        throw new Error(
          'Manifest append and recover require a LOCAL knowledge base.',
        );
      }
      return existing;
    }

    const initiate = manifest.initiate;
    if (!initiate) throw new Error('Manifest initiate config is required.');
    const ownershipMarker = manifestKnowledgeBaseOwnershipMarker(record.id);
    if (existing) {
      const ownsExisting =
        (record.knowledgeBaseId != null &&
          String(record.knowledgeBaseId) === String(existing.id)) ||
        existing.knowledgeBaseOuterId === ownershipMarker;
      if (!ownsExisting) {
        throw new Error(
          `Knowledge base key "${manifest.key}" is already in use.`,
        );
      }
      if (existing.knowledgeBaseType !== 'LOCAL') {
        throw new Error('Manifest init requires a LOCAL knowledge base.');
      }
      if (record.knowledgeBaseId == null) {
        await this.repositories.manifests.update(
          { id: record.id },
          { knowledgeBaseId: existing.id },
        );
      }
      return existing;
    }
    if (record.knowledgeBaseId != null) {
      throw new Error(
        'The knowledge base created by this Manifest no longer exists.',
      );
    }
    await this.requireReferences(initiate.vectorDatabase, initiate.llmService);
    const created = await this.managers.knowledgeBases.create({
      knowledgeBaseOuterId: ownershipMarker,
      key: manifest.key,
      name: initiate.name,
      description: initiate.description,
      knowledgeBaseType: 'LOCAL',
      disk: initiate.disk,
      vectorDatabaseKey: initiate.vectorDatabase,
      llmService: initiate.llmService,
      embeddingModel: initiate.embeddingModel,
      enabled: true,
    });
    await this.repositories.manifests.update(
      { id: record.id },
      { knowledgeBaseId: created.id },
    );
    return created;
  }

  private async requireReferences(
    vectorDatabaseKey: string,
    llmServiceName: string,
  ): Promise<void> {
    const vectorDatabase = await this.repositories.vectorDatabases.findOne({
      key: vectorDatabaseKey,
      enabled: true,
    });
    if (!vectorDatabase) {
      throw new Error(
        `Enabled vector database "${vectorDatabaseKey}" was not found.`,
      );
    }
    const llmService =
      await this.ai.llmServiceManager.getLLMService(llmServiceName);
    if (!llmService?.enabled) {
      throw new Error(`Enabled LLM service "${llmServiceName}" was not found.`);
    }
  }

  private async ensureManifestFiles(
    manifestRecordId: string | number,
    manifest: KnowledgeBaseManifest,
  ): Promise<KnowledgeBaseManifestFileEntity[]> {
    const expected = flattenFiles(manifest, manifestRecordId);
    const existing = await this.repositories.manifestFiles.find({
      filter: { manifestRecordId },
      sort: ['sourceDisk', 'sourceLocation', 'id'],
    });
    const identities = new Set(
      existing.map((file) =>
        manifestFileIdentity(file.sourceDisk, file.sourceLocation),
      ),
    );
    const missing = expected.filter(
      (file) =>
        !identities.has(
          manifestFileIdentity(
            String(file.sourceDisk),
            String(file.sourceLocation),
          ),
        ),
    );
    await this.repositories.manifestFiles.createMany(missing);
    return missing.length
      ? this.repositories.manifestFiles.find({
          filter: { manifestRecordId },
          sort: ['sourceDisk', 'sourceLocation', 'id'],
        })
      : existing;
  }

  private async processFile(
    record: KnowledgeBaseManifestEntity,
    manifest: KnowledgeBaseManifest,
    base: Awaited<
      ReturnType<DefaultKnowledgeBaseManifestService['prepareTarget']>
    >,
    file: KnowledgeBaseManifestFileEntity,
  ): Promise<void> {
    await this.repositories.manifestFiles.update(
      { id: file.id },
      {
        status: 'PROCESSING',
        attemptCount: Number(file.attemptCount ?? 0) + 1,
        failureReason: null,
      },
    );
    const bytes = await readDriveObject(
      this.drive,
      file.sourceDisk,
      file.sourceLocation,
    );
    const contentHash = hashBytes(bytes);

    if (manifest.operation === 'recover') {
      await this.recoverFile(record, base, file, bytes, contentHash);
      return;
    }

    const documentKey = file.documentKey ?? `manifest-${record.id}-${file.id}`;
    let document: KnowledgeBaseDocumentEntity | null = null;
    if (file.documentId != null) {
      document = await this.repositories.documents.findById(file.documentId);
    }
    document ??= await this.repositories.documents.findOne({
      key: documentKey,
    });
    if (document && document.knowledgeBaseKey !== base.key) {
      throw new Error(
        'The document mapped for this Manifest file belongs to another knowledge base.',
      );
    }
    if (!document) {
      document = await this.managers.documents.storeDocument(
        base.key,
        {
          name: path.posix.basename(file.sourceLocation),
          bytes,
        },
        { documentKey },
      );
    } else if (file.contentHash !== contentHash) {
      await this.managers.vectorCleanup.deleteDocumentVectors(base, [
        document.id,
      ]);
      document = await this.managers.documents.replaceDocumentForRecovery(
        document,
        { name: path.posix.basename(file.sourceLocation), bytes },
      );
    }
    await this.repositories.manifestFiles.update(
      { id: file.id },
      {
        contentHash,
        documentId: document.id,
        documentKey: document.key,
      },
    );
    await this.managers.documents.dispatchVectorization(document.id);
    await this.repositories.manifestFiles.update(
      { id: file.id },
      { status: 'SUCCESS', contentHash, failureReason: null },
    );
  }

  private async recoverFile(
    record: KnowledgeBaseManifestEntity,
    base: Awaited<
      ReturnType<DefaultKnowledgeBaseManifestService['prepareTarget']>
    >,
    file: KnowledgeBaseManifestFileEntity,
    bytes: Uint8Array,
    contentHash: string,
  ): Promise<void> {
    if (
      file.documentId != null &&
      file.documentKey &&
      file.contentHash === contentHash
    ) {
      const interruptedDocument = await this.repositories.documents.findById(
        file.documentId,
      );
      if (
        interruptedDocument &&
        interruptedDocument.knowledgeBaseKey === base.key &&
        interruptedDocument.key === file.documentKey
      ) {
        await this.managers.documents.dispatchVectorization(
          interruptedDocument.id,
        );
        await this.repositories.manifestFiles.update(
          { id: file.id },
          { status: 'SUCCESS', failureReason: null },
        );
        return;
      }
    }

    const mappings = await this.repositories.manifestFiles.find({
      filter: {
        knowledgeBaseKey: base.key,
        sourceDisk: file.sourceDisk,
        sourceLocation: file.sourceLocation,
        status: 'SUCCESS',
      },
      sort: ['-createdAt', '-id'],
    });
    const mapping = mappings.find(
      (candidate) => String(candidate.manifestRecordId) !== String(record.id),
    );
    if (mapping?.documentId == null || !mapping.documentKey) {
      throw new Error('No successful document mapping exists for recover.');
    }
    const document = await this.repositories.documents.findById(
      mapping.documentId,
    );
    if (
      !document ||
      document.knowledgeBaseKey !== base.key ||
      document.key !== mapping.documentKey
    ) {
      throw new Error('The document mapped for recover no longer exists.');
    }
    if (mapping.contentHash === contentHash) {
      await this.repositories.manifestFiles.update(
        { id: file.id },
        {
          status: 'SUCCESS',
          contentHash,
          documentId: document.id,
          documentKey: document.key,
          failureReason: null,
        },
      );
      return;
    }
    await this.managers.vectorCleanup.deleteDocumentVectors(base, [
      document.id,
    ]);
    const updated = await this.managers.documents.replaceDocumentForRecovery(
      document,
      { name: path.posix.basename(file.sourceLocation), bytes },
    );
    await this.repositories.manifestFiles.update(
      { id: file.id },
      {
        contentHash,
        documentId: updated.id,
        documentKey: updated.key,
      },
    );
    await this.managers.documents.dispatchVectorization(updated.id);
    await this.repositories.manifestFiles.update(
      { id: file.id },
      { status: 'SUCCESS', failureReason: null },
    );
  }

  private async toRecord(
    record: KnowledgeBaseManifestEntity,
  ): Promise<ManifestRecord> {
    const files = await this.repositories.manifestFiles.find({
      filter: { manifestRecordId: record.id },
      sort: ['sourceDisk', 'sourceLocation'],
    });
    return { ...record, files: files.map(toFileRecord) };
  }
}

function flattenFiles(
  manifest: KnowledgeBaseManifest,
  manifestRecordId: string | number,
): Array<Partial<KnowledgeBaseManifestFileEntity>> {
  return manifest.files.flatMap((group) =>
    group.locations.map((location) => ({
      manifestRecordId,
      sourceDisk: group.disk.trim(),
      sourceLocation: normalizeManifestLocation(location),
      knowledgeBaseKey: manifest.key,
      contentHash: null,
      documentId: null,
      documentKey: null,
      status: 'PENDING' as const,
      attemptCount: 0,
      failureReason: null,
    })),
  );
}

function toFileRecord(
  file: KnowledgeBaseManifestFileEntity,
): ManifestFileRecord {
  return file;
}

function manifestFileIdentity(disk: string, location: string): string {
  return `${disk}\0${location}`;
}

async function readDriveObject(
  drive: NocoBaseDriveManager,
  disk: string,
  location: string,
): Promise<Uint8Array> {
  const stream = await drive.use(disk).getStream(location);
  const chunks: Buffer[] = [];
  for await (const chunk of stream as AsyncIterable<unknown>) {
    chunks.push(
      typeof chunk === 'string'
        ? Buffer.from(chunk)
        : Buffer.from(chunk as Uint8Array),
    );
  }
  return Buffer.concat(chunks);
}
function manifestKnowledgeBaseOwnershipMarker(
  manifestRecordId: string | number,
): string {
  return `manifest:${manifestRecordId}`;
}

function hashBytes(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
