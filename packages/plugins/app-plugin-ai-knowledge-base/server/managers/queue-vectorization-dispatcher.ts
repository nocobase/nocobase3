import type { NocoBaseQueueManager } from '@nocobase/queue';

import KnowledgeBaseVectorizationJob from '../jobs/knowledge-base-vectorization.js';
import type { KnowledgeBaseVectorizationDispatcher } from '../internal-types.js';

export class QueueVectorizationDispatcher implements KnowledgeBaseVectorizationDispatcher {
  public constructor(private readonly queue: NocoBaseQueueManager) {}

  public async dispatch(options: {
    readonly documentId: string | number;
    readonly relatedQuestions?: readonly string[];
    readonly rebuildOnly?: boolean;
  }): Promise<void> {
    await this.queue.dispatch(
      KnowledgeBaseVectorizationJob,
      {
        knowledgeBaseDocsId: options.documentId,
        ...(options.relatedQuestions
          ? { relatedQuestions: [...options.relatedQuestions] }
          : {}),
        rebuildOnly: options.rebuildOnly ?? false,
      },
      {
        groupId: `ai-kb-doc:${options.documentId}`,
        dedup: {
          id: `ai-kb-doc:${options.documentId}`,
          ttl: 300_000,
        },
      },
    );
  }
}
