import type {
  JsonRecord,
  KnowledgeBaseDocumentRecord,
  SegmentOptions,
  SegmentQuestion,
  SegmentRecord,
} from '../internal-types.js';
import type { KnowledgeBaseDocumentManager } from '../managers/knowledge-base-document-manager.js';
import type { KnowledgeBaseSegmentManager } from '../managers/knowledge-base-segment-manager.js';
import { normalizeSegmentOptions } from '../managers/segment-options.js';
import type { TableRepository } from '../repositories/table-repository.js';
import { page, type PageOptions, type PageResult } from './pagination.js';

export class KnowledgeBaseSegmentService {
  public constructor(
    private readonly manager: KnowledgeBaseSegmentManager,
    private readonly documentManager: KnowledgeBaseDocumentManager,
    private readonly segments: TableRepository<SegmentRecord>,
    private readonly documents: TableRepository<KnowledgeBaseDocumentRecord>,
  ) {}

  public list(
    options: PageOptions & { documentId: string | number },
  ): Promise<PageResult<JsonRecord>> {
    return page({
      repository: this.segments,
      paging: options,
      filter: { knowledgeBaseDocsId: options.documentId },
    });
  }

  public get(options: {
    readonly documentId: string | number;
    readonly segmentUid: string;
  }): Promise<JsonRecord | null> {
    return this.manager.getContent(options.documentId, options.segmentUid);
  }

  public update(options: {
    readonly documentId: string | number;
    readonly segmentUid: string;
    readonly expectedContentHash: string;
    readonly title?: string;
    readonly content?: string;
    readonly questions?: readonly SegmentQuestion[];
    readonly userId?: string | number;
  }): Promise<JsonRecord> {
    return this.manager.updateContent(options.documentId, options.segmentUid, {
      contentHash: options.expectedContentHash,
      ...(options.title !== undefined ? { title: options.title } : {}),
      ...(options.content !== undefined ? { content: options.content } : {}),
      ...(options.questions ? { questions: [...options.questions] } : {}),
    });
  }

  public async setEnabled(options: {
    readonly documentId: string | number;
    readonly segmentUid: string;
    readonly enabled: boolean;
  }): Promise<JsonRecord | null> {
    const segment = await this.segments.findOne({
      knowledgeBaseDocsId: options.documentId,
      uid: options.segmentUid,
    });
    if (!segment) return null;
    await this.segments.update(
      { id: segment.id },
      { enabled: options.enabled },
    );
    await this.documentManager.dispatchVectorization(
      segment.knowledgeBaseDocsId,
      undefined,
      true,
    );
    return this.manager.getContent(segment.knowledgeBaseDocsId, segment.uid);
  }

  public async delete(options: {
    readonly documentId: string | number;
    readonly segmentUid: string;
  }): Promise<boolean> {
    const segment = await this.segments.findOne({
      knowledgeBaseDocsId: options.documentId,
      uid: options.segmentUid,
    });
    if (!segment) return false;
    await this.segments.destroy({ id: segment.id });
    await this.documentManager.dispatchVectorization(
      segment.knowledgeBaseDocsId,
      undefined,
      true,
    );
    return true;
  }

  public async regenerate(options: {
    readonly documentId: string | number;
    readonly segmentOptions?: SegmentOptions | JsonRecord;
  }): Promise<void> {
    if (options.segmentOptions) {
      await this.documents.update(
        { id: options.documentId },
        { segmentOptions: normalizeSegmentOptions(options.segmentOptions) },
      );
    }
    await this.documentManager.dispatchVectorization(options.documentId);
  }
}
