import { createHash } from 'node:crypto';
import { Document } from '@langchain/core/documents';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { nanoid } from 'nanoid';
import type { AIManager, FileManager } from '@nocobase/ai-employee';
import type { DatabaseConnection } from '@nocobase/db';
import type { NocoBaseQueueManager } from '@nocobase/queue';
import { TableRepository } from './repository.js';
import type {
  JsonRecord,
  KnowledgeBaseDocumentRecord,
  KnowledgeBaseRecord,
  SegmentOptions,
  SegmentQuestion,
  SegmentRecord,
  SegmentShardRecord,
  VectorDatabaseRecord,
  VectorStoreConfigRecord,
} from './types.js';
import { PGVectorProvider } from './vector.js';
import KnowledgeBaseVectorizationJob, {
  registerVectorizationRuntime,
} from './jobs/knowledge-base-vectorization.js';
import { extractZipFiles } from './zip.js';

const EXTENSIONS = new Set(['.doc', '.docx', '.md', '.pdf', '.txt', '.zip']);
const sha = (value: string): string =>
  createHash('sha256').update(value).digest('hex');
const preview = (value: string): string =>
  value.replace(/\s+/g, ' ').trim().slice(0, 200);
export function normalizeSegmentOptions(value: unknown): SegmentOptions {
  const input =
    value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : {};
  const chunkSize = Math.min(
    100_000,
    Math.max(1, Number(input.chunkSize) || 6000),
  );
  const chunkOverlap = Math.min(
    chunkSize - 1,
    Math.max(0, Number(input.chunkOverlap) || 1200),
  );
  return { enabled: input.enabled !== false, chunkSize, chunkOverlap };
}

export class KnowledgeBaseService {
  readonly bases: TableRepository<KnowledgeBaseRecord>;
  readonly docs: TableRepository<KnowledgeBaseDocumentRecord>;
  readonly segments: TableRepository<SegmentRecord>;
  readonly shards: TableRepository<SegmentShardRecord>;
  readonly vectors: TableRepository<VectorDatabaseRecord>;
  readonly vectorConfigs: TableRepository<VectorStoreConfigRecord>;
  constructor(
    readonly database: DatabaseConnection,
    readonly ai: AIManager,
    readonly fileManager: FileManager,
    readonly queueManager: NocoBaseQueueManager,
    readonly vectorProvider: PGVectorProvider,
  ) {
    this.bases = new TableRepository(database, 'aiKnowledgeBase');
    this.docs = new TableRepository(database, 'aiKnowledgeBaseDocs');
    this.segments = new TableRepository(database, 'aiKnowledgeBaseDocSegments');
    this.shards = new TableRepository(
      database,
      'aiKnowledgeBaseDocSegmentShards',
    );
    this.vectors = new TableRepository(database, 'aiVectorDatabases');
    this.vectorConfigs = new TableRepository(database, 'aiVectorStoreConfig');
    registerVectorizationRuntime(this);
  }
  async createKnowledgeBase(values: JsonRecord): Promise<KnowledgeBaseRecord> {
    const type = String(values.knowledgeBaseType ?? 'LOCAL');
    if (!['LOCAL', 'READONLY', 'EXTERNAL'].includes(type))
      throw new Error('Invalid knowledgeBaseType');
    const vectorStoreConfigKey = String(
      values.vectorStoreConfigKey ?? nanoid(32),
    );
    if (
      type !== 'EXTERNAL' &&
      (values.llmService ||
        values.embeddingModel ||
        values.vectorDatabaseKey ||
        values.vectorStoreConfigKey)
    ) {
      await this.vectorConfigs.create({
        key: vectorStoreConfigKey,
        name: `${String(values.name ?? 'Knowledge base')} vector store`,
        vectorDatabaseKey: String(
          values.vectorDatabaseKey ?? values.vectorStoreConfigKey ?? '',
        ),
        llmService: String(values.llmService ?? ''),
        embeddingModel: String(values.embeddingModel ?? ''),
        enabled: true,
      });
    }
    const {
      llmService: _llmService,
      embeddingModel: _embeddingModel,
      vectorDatabaseKey: _vectorDatabaseKey,
      externalProvider: _externalProvider,
      ...baseValues
    } = values;
    return this.bases.create({
      ...baseValues,
      vectorStoreConfigKey,
      key: String(values.key ?? nanoid(32)),
      knowledgeBaseType: type as KnowledgeBaseRecord['knowledgeBaseType'],
      knowledgeBaseOuterId: String(values.knowledgeBaseOuterId ?? nanoid(32)),
      vectorStoreProvider: String(
        values.vectorStoreProvider ??
          (type === 'LOCAL'
            ? 'NocobaseLocalVectorStoreProvider'
            : type === 'READONLY'
              ? 'NocobaseReadonlyVectorStoreProvider'
              : String(values.externalProvider ?? '')),
      ),
      segmentOptions: normalizeSegmentOptions(values.segmentOptions),
      enabled: values.enabled !== false,
      documentCount: 0,
      characterCount: 0,
      aiEmployeeCount: 0,
      confirmVectorStoreChanged: new Date(),
    });
  }
  async updateKnowledgeBase(
    id: string | number,
    values: JsonRecord,
  ): Promise<KnowledgeBaseRecord | null> {
    const base = await this.bases.findById(id);
    if (!base) return null;
    const configValues: Partial<VectorStoreConfigRecord> = {};
    if (values.llmService !== undefined)
      configValues.llmService = String(values.llmService);
    if (values.embeddingModel !== undefined)
      configValues.embeddingModel = String(values.embeddingModel);
    if (
      values.vectorDatabaseKey !== undefined ||
      values.vectorStoreConfigKey !== undefined
    ) {
      configValues.vectorDatabaseKey = String(
        values.vectorDatabaseKey ?? values.vectorStoreConfigKey,
      );
    }
    if (Object.keys(configValues).length) {
      const existing = await this.vectorConfigs.findOne({
        key: base.vectorStoreConfigKey,
      });
      if (existing)
        await this.vectorConfigs.update({ id: existing.id }, configValues);
      else
        await this.vectorConfigs.create({
          key: base.vectorStoreConfigKey ?? nanoid(32),
          name: `${base.name} vector store`,
          embeddingModel: String(configValues.embeddingModel ?? ''),
          enabled: true,
          ...configValues,
        });
    }
    const {
      llmService: _llmService,
      embeddingModel: _embeddingModel,
      vectorDatabaseKey: _vectorDatabaseKey,
      ...baseValues
    } = values;
    await this.bases.update(
      { id },
      {
        ...baseValues,
        segmentOptions: values.segmentOptions
          ? normalizeSegmentOptions(values.segmentOptions)
          : undefined,
      },
    );
    return this.bases.findById(id);
  }
  async upload(
    knowledgeBaseKey: string,
    file: { name: string; type?: string; bytes: Uint8Array },
    actorId?: string,
  ): Promise<KnowledgeBaseDocumentRecord> {
    const base = await this.requireBase(knowledgeBaseKey);
    if (base.knowledgeBaseType !== 'LOCAL')
      throw new Error('Only LOCAL knowledge bases accept documents');
    const ext = this.extension(file.name);
    if (!EXTENSIONS.has(ext))
      throw new Error(`Unsupported file type: ${ext || 'none'}`);
    if (ext === '.zip') {
      const extracted = (await extractZipFiles(file.bytes)).filter(
        (entry) =>
          EXTENSIONS.has(this.extension(entry.name)) &&
          this.extension(entry.name) !== '.zip',
      );
      if (!extracted.length)
        throw new Error('ZIP archive contains no supported documents');
      const created: KnowledgeBaseDocumentRecord[] = [];
      for (const entry of extracted) {
        created.push(
          await this.upload(
            knowledgeBaseKey,
            { name: entry.name, bytes: entry.bytes },
            actorId,
          ),
        );
      }
      return created[0];
    }
    const key = nanoid(32);
    const stored = await this.fileManager.put(
      `knowledge-base/${key}`,
      file.bytes,
      file.name,
      file.type,
    );
    const record = await this.docs.create({
      key,
      title: file.name,
      filename: file.name,
      extname: ext,
      size: stored.size,
      mimetype: file.type || stored.mimetype || 'application/octet-stream',
      path: stored.key,
      url: stored.url,
      storageId: base.storageId,
      meta: { key: stored.key },
      knowledgeBaseKey,
      indexStatus: 'PENDING',
      errorMessage: null,
      characterCount: 0,
      segmentCount: 0,
      segmentVersion: 0,
      segmentRevision: 0,
      segmentStatus: 'PENDING',
      segmentErrorMessage: null,
      segmentOptions: base.segmentOptions,
      enabled: true,
      createdById: actorId,
    });
    await this.dispatchVectorization(record.id);
    return record;
  }
  async finalizeUpload(
    knowledgeBaseKey: string,
    values: JsonRecord,
    actorId?: string,
  ): Promise<KnowledgeBaseDocumentRecord> {
    const base = await this.requireBase(knowledgeBaseKey);
    const filename = String(values.title ?? values.filename ?? 'file');
    const extname = String(
      values.extname ?? this.extension(filename),
    ).toLowerCase();
    if (!EXTENSIONS.has(extname))
      throw new Error(`Unsupported file type: ${extname || 'none'}`);
    const record = await this.docs.create({
      ...values,
      key: String(values.key ?? nanoid(32)),
      title: filename,
      filename: String(values.filename ?? filename),
      extname,
      knowledgeBaseKey,
      indexStatus: 'PENDING',
      errorMessage: null,
      characterCount: 0,
      segmentCount: 0,
      segmentVersion: 0,
      segmentRevision: 0,
      segmentStatus: 'PENDING',
      segmentOptions: base.segmentOptions,
      enabled: true,
      createdById: actorId,
    });
    await this.dispatchVectorization(record.id);
    return record;
  }
  async dispatchVectorization(
    id: string | number,
    relatedQuestions?: string[],
    rebuildOnly = false,
  ): Promise<void> {
    await this.docs.update(
      { id },
      { indexStatus: 'PENDING', errorMessage: null },
    );
    await this.queueManager.dispatch(
      KnowledgeBaseVectorizationJob,
      { knowledgeBaseDocsId: id, relatedQuestions, rebuildOnly },
      {
        groupId: `ai-kb-doc:${id}`,
        dedup: { id: `ai-kb-doc:${id}`, ttl: 300_000 },
      },
    );
  }
  async reindexExistingSegments(id: string | number): Promise<void> {
    const doc = await this.docs.findById(id);
    if (!doc) throw new Error(`Knowledge base document #${id} not found`);
    const base = await this.requireBase(doc.knowledgeBaseKey);
    await this.docs.update(
      { id },
      { indexStatus: 'PROCESSING', errorMessage: null },
    );
    try {
      await this.rebuildVectors(base, id);
      const rows = await this.segments.find({
        filter: { knowledgeBaseDocsId: id },
      });
      await this.docs.update(
        { id },
        {
          indexStatus: 'SUCCESS',
          errorMessage: null,
          segmentCount: rows.length,
          characterCount: rows
            .filter((row) => row.enabled !== false)
            .reduce((sum, row) => sum + Number(row.charLength || 0), 0),
          segmentRevision: Number(doc.segmentRevision || 0) + 1,
          segmentUpdatedAt: new Date(),
        },
      );
      await this.refreshStatistics(base.key);
    } catch (error) {
      await this.docs.update(
        { id },
        {
          indexStatus: 'ERROR',
          errorMessage: error instanceof Error ? error.message : String(error),
        },
      );
      throw error;
    }
  }
  async vectorize(
    id: string | number,
    relatedQuestions: string[] = [],
  ): Promise<void> {
    const doc = await this.docs.findById(id);
    if (!doc) throw new Error(`Knowledge base document #${id} not found`);
    const base = await this.requireBase(doc.knowledgeBaseKey);
    await this.docs.update(
      { id },
      {
        indexStatus: 'PROCESSING',
        segmentStatus: 'PROCESSING',
        errorMessage: null,
      },
    );
    try {
      const loaded = await this.aiContextDocumentLoad(doc);
      const options = normalizeSegmentOptions(
        doc.segmentOptions ?? base.segmentOptions,
      );
      const splits = options.enabled
        ? await new RecursiveCharacterTextSplitter(options).splitDocuments(
            loaded,
          )
        : [
            new Document({
              pageContent: loaded.map((item) => item.pageContent).join('\n\n'),
            }),
          ];
      await this.deleteSegments(id);
      const version = Number(doc.segmentVersion ?? 0) + 1;
      for (let shardNo = 0; shardNo * 100 < splits.length; shardNo++) {
        const batch = splits.slice(shardNo * 100, shardNo * 100 + 100);
        const contents: Record<
          string,
          { title: string; content: string; questions: SegmentQuestion[] }
        > = {};
        const pending: Array<Partial<SegmentRecord>> = [];
        batch.forEach((item, index) => {
          const uid = nanoid(32);
          const content = item.pageContent.replace(/\r\n/g, '\n');
          const questions = relatedQuestions.map((question) => ({
            id: nanoid(16),
            content: question,
            enabled: true,
            hash: sha(question),
          }));
          contents[uid] = { title: '', content, questions };
          pending.push({
            uid,
            knowledgeBaseKey: base.key,
            knowledgeBaseOuterId: base.knowledgeBaseOuterId,
            knowledgeBaseDocsId: id,
            shardNo,
            contentKey: uid,
            position: shardNo * 100 + index,
            title: '',
            preview: preview(content),
            contentHash: sha(`\n${content}`),
            charLength: content.length,
            questionCount: questions.length,
            enabled: true,
            segmentVersion: version,
            meta: item.metadata as JsonRecord,
          });
        });
        const json = JSON.stringify({
          schemaVersion: 1,
          knowledgeBaseKey: base.key,
          knowledgeBaseDocsId: id,
          segmentVersion: version,
          shardNo,
          segments: contents,
        });
        const stored = await this.fileManager.put(
          `knowledge-base/${base.key}/${id}/shard-${shardNo}`,
          Buffer.from(json),
          `shard-${String(shardNo).padStart(4, '0')}.json`,
          'application/json',
        );
        const shard = await this.shards.create(
          {
            knowledgeBaseKey: base.key,
            knowledgeBaseDocsId: id,
            shardNo,
            segmentVersion: version,
            segmentCount: batch.length,
            contentHash: sha(json),
            filename: stored.filename,
            path: stored.key,
            url: stored.url,
            size: stored.size,
            mimetype: 'application/json',
            storageId: base.storageId,
            meta: { segments: contents },
          },
          { knowledgeBaseDocsId: id, segmentVersion: version, shardNo },
        );
        await this.segments.createMany(
          pending.map((item) => ({ ...item, shardId: shard.id })),
        );
      }
      await this.rebuildVectors(base, id);
      const characterCount = splits.reduce(
        (sum, item) => sum + item.pageContent.length,
        0,
      );
      await this.docs.update(
        { id },
        {
          indexStatus: 'SUCCESS',
          segmentStatus: 'SUCCESS',
          segmentVersion: version,
          segmentRevision: Number(doc.segmentRevision ?? 0) + 1,
          segmentUpdatedAt: new Date(),
          segmentCount: splits.length,
          characterCount,
          errorMessage: null,
          segmentErrorMessage: null,
        },
      );
      await this.refreshStatistics(base.key);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.docs.update(
        { id },
        {
          indexStatus: 'ERROR',
          segmentStatus: 'ERROR',
          errorMessage: message,
          segmentErrorMessage: message,
        },
      );
      throw error;
    }
  }
  async listSegmentContent(
    id: string | number,
    uid: string,
  ): Promise<JsonRecord | null> {
    const segment = await this.segments.findOne({
      knowledgeBaseDocsId: id,
      uid,
    });
    if (!segment) return null;
    const shard = await this.shards.findById(segment.shardId);
    if (!shard) return null;
    const contents = (shard.meta?.segments ?? {}) as Record<string, JsonRecord>;
    return { ...segment, ...(contents[segment.contentKey] ?? {}) };
  }
  async updateSegment(
    id: string | number,
    uid: string,
    values: {
      title?: string;
      content?: string;
      questions?: SegmentQuestion[];
      contentHash: string;
    },
  ): Promise<JsonRecord> {
    const segment = await this.segments.findOne({
      knowledgeBaseDocsId: id,
      uid,
    });
    if (!segment) throw new Error('Segment not found');
    if (segment.contentHash !== values.contentHash) {
      const error = new Error('Segment content has changed');
      (error as Error & { status?: number }).status = 409;
      throw error;
    }
    const shard = await this.shards.findById(segment.shardId);
    if (!shard) throw new Error('Segment shard not found');
    const contents = (shard.meta.segments ?? {}) as Record<string, JsonRecord>;
    const current = contents[uid] ?? {};
    const title = values.title ?? String(current.title ?? '');
    const content = values.content ?? String(current.content ?? '');
    const questions =
      values.questions ?? (current.questions as SegmentQuestion[]) ?? [];
    contents[uid] = { ...current, title, content, questions };
    const hash = sha(`${title}\n${content}`);
    await this.shards.update(
      { id: shard.id },
      { meta: { ...shard.meta, segments: contents } },
    );
    await this.segments.update(
      { id: segment.id },
      {
        title,
        preview: preview(content),
        contentHash: hash,
        charLength: content.length,
        questionCount: questions.filter((item) => item.enabled !== false)
          .length,
      },
    );
    await this.dispatchVectorization(id, undefined, true);
    return (await this.listSegmentContent(id, uid))!;
  }
  async deleteSegments(
    ids: string | number | Array<string | number>,
  ): Promise<void> {
    const values = Array.isArray(ids) ? ids : [ids];
    for (const shard of await this.shards.find({
      filter: { knowledgeBaseDocsId: { $in: values } },
    }))
      if (shard.path)
        await this.fileManager.delete(shard.path).catch(() => undefined);
    await this.segments.destroy({ knowledgeBaseDocsId: { $in: values } });
    await this.shards.destroy({ knowledgeBaseDocsId: { $in: values } });
  }
  async deleteDocuments(ids: Array<string | number>): Promise<void> {
    await this.deleteSegments(ids);
    for (const doc of await this.docs.find({ filter: { id: { $in: ids } } }))
      if (doc.path)
        await this.fileManager.delete(doc.path).catch(() => undefined);
    await this.docs.destroy({ id: { $in: ids } });
  }
  async hitTest(
    key: string,
    query: string,
    topK?: number,
    score?: number,
  ): Promise<JsonRecord[]> {
    const results = await this.ai.features.knowledgeBase.search({
      knowledgeBaseKeys: [key],
      query,
      topK,
      score: score === undefined ? undefined : String(score),
    });
    const docs = await this.docs.find({
      filter: {
        id: {
          $in: results
            .map((item) => item.metadata.knowledgeBaseDocsId as string | number)
            .filter(Boolean),
        },
      },
    });
    const map = new Map(docs.map((item) => [String(item.id), item]));
    return results.map((item) => {
      const doc = map.get(String(item.metadata.knowledgeBaseDocsId));
      return {
        id: item.id,
        content: item.content,
        score: item.score,
        title: doc?.title,
        filename: doc?.filename,
        matchedQuestions: item.metadata.matchedQuestions ?? [],
        metadata: item.metadata,
      };
    });
  }
  async refreshStatistics(key: string): Promise<void> {
    const docs = await this.docs.find({ filter: { knowledgeBaseKey: key } });
    await this.bases.update(
      { key },
      {
        documentCount: docs.length,
        characterCount: docs.reduce(
          (sum, item) => sum + Number(item.characterCount ?? 0),
          0,
        ),
      },
    );
  }
  private async rebuildVectors(
    base: KnowledgeBaseRecord,
    id: string | number,
  ): Promise<void> {
    if (base.knowledgeBaseType !== 'LOCAL') return;
    const vectorConfig = await this.vectorConfigs.findOne({
      key: base.vectorStoreConfigKey,
    });
    if (!vectorConfig?.vectorDatabaseKey) return;
    const vectorDb = await this.vectors.findOne({
      key: vectorConfig.vectorDatabaseKey,
    });
    if (!vectorDb) return;
    const llmService = String(vectorConfig.llmService ?? '');
    const model = String(vectorConfig.embeddingModel ?? '');
    if (!llmService || !model) return;
    const embedding = await this.ai.llmProviderManager.createEmbedding({
      llmService,
      model,
    });
    const store = await this.vectorProvider.createVectorStore(
      embedding,
      vectorDb.connectProps,
    );
    await store.delete({ filter: { knowledgeBaseDocsId: id } });
    const rows = await this.segments.find({
      filter: { knowledgeBaseDocsId: id, enabled: true },
      sort: ['position'],
    });
    const documents: Document[] = [];
    for (const row of rows) {
      const value = await this.listSegmentContent(id, row.uid);
      if (!value) continue;
      const metadata = {
        ...row.meta,
        knowledgeBaseDocsId: id,
        knowledgeBaseOuterId: base.knowledgeBaseOuterId,
        segmentUid: row.uid,
        sourceType: 'paragraph',
      };
      documents.push(
        new Document({
          pageContent: String(value.content ?? ''),
          metadata,
          id: row.uid,
        }),
      );
      for (const question of (
        (value.questions as SegmentQuestion[]) ?? []
      ).filter((item) => item.enabled !== false))
        documents.push(
          new Document({
            pageContent: question.content,
            metadata: { ...metadata, sourceType: 'question' },
          }),
        );
    }
    for (let index = 0; index < documents.length; index += 10)
      await store.addDocuments(documents.slice(index, index + 10));
  }
  private async aiContextDocumentLoad(
    doc: KnowledgeBaseDocumentRecord,
  ): Promise<Document[]> {
    const runtime = this.ai as AIManager & {
      __context?: {
        documentLoaders?: {
          raw?: { load(file: unknown): Promise<Document[]> };
        };
      };
    };
    const loader = runtime.__context?.documentLoaders?.raw;
    if (!loader) {
      const bytes = doc.path
        ? await this.fileManager.getBytes(doc.path)
        : new Uint8Array();
      return [
        new Document({ pageContent: Buffer.from(bytes).toString('utf8') }),
      ];
    }
    return loader.load(doc);
  }
  private async requireBase(key: string): Promise<KnowledgeBaseRecord> {
    const base = await this.bases.findOne({ key });
    if (!base) throw new Error(`Knowledge base #${key} not found`);
    return base;
  }
  private extension(filename: string): string {
    const dot = filename.lastIndexOf('.');
    return dot < 0 ? '' : filename.slice(dot).toLowerCase();
  }
}
