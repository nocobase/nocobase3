import { createHash } from 'node:crypto';

import type { DocumentSegmentedWithScore } from '@nocobase/ai-employee';

import type {
  JsonRecord,
  SegmentQuestion,
  SegmentRecord,
  SegmentShardRecord,
} from '../internal-types.js';
import type { TableRepository } from '../repositories/table-repository.js';
import type { KnowledgeBaseDocumentManager } from './knowledge-base-document-manager.js';
import type { KnowledgeBaseManager } from './knowledge-base-manager.js';
import type { KnowledgeBaseStorageManager } from './knowledge-base-storage-manager.js';

const sha = (value: string): string =>
  createHash('sha256').update(value).digest('hex');
const preview = (value: string): string =>
  value.replace(/\s+/g, ' ').trim().slice(0, 200);

export class KnowledgeBaseSegmentManager {
  public constructor(
    private readonly segments: TableRepository<SegmentRecord>,
    private readonly segmentShards: TableRepository<SegmentShardRecord>,
    private readonly knowledgeBases: KnowledgeBaseManager,
    private readonly storage: KnowledgeBaseStorageManager,
    private readonly documents: KnowledgeBaseDocumentManager,
  ) {}

  public async getContent(
    documentId: string | number,
    segmentUid: string,
  ): Promise<JsonRecord | null> {
    const segment = await this.segments.findOne({
      knowledgeBaseDocsId: documentId,
      uid: segmentUid,
    });
    if (!segment) return null;
    const shard = await this.segmentShards.findById(segment.shardId);
    if (!shard) return null;
    const base = await this.knowledgeBases.require(shard.knowledgeBaseKey);
    const contents = await this.storage.readShardContents(base, shard);
    return { ...segment, ...(contents[segment.contentKey] ?? {}) };
  }

  public async updateContent(
    documentId: string | number,
    segmentUid: string,
    values: {
      title?: string;
      content?: string;
      questions?: SegmentQuestion[];
      contentHash: string;
    },
  ): Promise<JsonRecord> {
    const segment = await this.segments.findOne({
      knowledgeBaseDocsId: documentId,
      uid: segmentUid,
    });
    if (!segment) throw new Error('Segment not found');
    if (segment.contentHash !== values.contentHash) {
      const error = new Error('Segment content has changed');
      (error as Error & { status?: number }).status = 409;
      throw error;
    }
    const shard = await this.segmentShards.findById(segment.shardId);
    if (!shard) throw new Error('Segment shard not found');
    const base = await this.knowledgeBases.require(shard.knowledgeBaseKey);
    const contents = await this.storage.readShardContents(base, shard);
    const current = contents[segmentUid] ?? {};
    const title = values.title ?? String(current.title ?? '');
    const content = values.content ?? String(current.content ?? '');
    const questions =
      values.questions ?? (current.questions as SegmentQuestion[]) ?? [];
    contents[segmentUid] = { ...current, title, content, questions };
    const hash = sha(`${title}\n${content}`);
    await this.segmentShards.update(
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
    await this.documents.dispatchVectorization(documentId, undefined, true);
    return (await this.getContent(documentId, segmentUid))!;
  }

  public async deleteByDocumentIds(
    ids: string | number | Array<string | number>,
  ): Promise<void> {
    const values = Array.isArray(ids) ? ids : [ids];
    await this.segments.destroy({ knowledgeBaseDocsId: { $in: values } });
    await this.segmentShards.destroy({ knowledgeBaseDocsId: { $in: values } });
  }

  public async mergeLocalSearchResults(
    results: DocumentSegmentedWithScore[],
  ): Promise<DocumentSegmentedWithScore[]> {
    const passthroughResults: DocumentSegmentedWithScore[] = [];
    const grouped = new Map<
      string,
      {
        segmentUid: string;
        paragraph?: DocumentSegmentedWithScore;
        questions: DocumentSegmentedWithScore[];
        score: number;
      }
    >();

    for (const result of results) {
      const metadata = result.metadata;
      const segmentUid =
        typeof metadata.segmentUid === 'string'
          ? metadata.segmentUid
          : undefined;
      if (!segmentUid) {
        passthroughResults.push(result);
        continue;
      }
      const group = grouped.get(segmentUid) ?? {
        segmentUid,
        questions: [],
        score: result.score,
      };
      group.score = Math.max(group.score, result.score);
      if (metadata.sourceType === 'question') {
        group.questions.push(result);
      } else {
        group.paragraph =
          group.paragraph && group.paragraph.score >= result.score
            ? group.paragraph
            : result;
      }
      grouped.set(segmentUid, group);
    }

    const merged: DocumentSegmentedWithScore[] = [];
    for (const group of grouped.values()) {
      const source = group.paragraph ?? group.questions[0];
      const metadata = source.metadata;
      const documentId = metadata.knowledgeBaseDocsId as
        string | number | undefined;
      let content = group.paragraph?.content;
      if (!content && documentId !== undefined) {
        const segment = await this.getContent(documentId, group.segmentUid);
        content = segment
          ? `${String(segment.title ?? '')}\n${String(segment.content ?? '')}`.trim()
          : undefined;
      }
      if (!content && !group.paragraph) continue;
      const matchedQuestions = group.questions
        .sort((left, right) => right.score - left.score)
        .map((item) => item.content);
      merged.push({
        ...source,
        content: content ?? source.content,
        metadata: {
          ...metadata,
          hitType:
            group.paragraph && group.questions.length
              ? 'both'
              : group.questions.length
                ? 'question'
                : 'paragraph',
          matchedQuestions,
        },
        score: group.score,
      });
    }

    return [...merged, ...passthroughResults].sort(
      (left, right) => right.score - left.score,
    );
  }
}
