import { Job, type JobOptions } from '@nocobase/queue';

import type { KnowledgeBaseVectorizationExecutor } from '../internal-types.js';

export interface KnowledgeBaseVectorizationPayload {
  knowledgeBaseDocsId: string | number;
  relatedQuestions?: string[];
  rebuildOnly?: boolean;
}

let executor: KnowledgeBaseVectorizationExecutor | undefined;

export function bindKnowledgeBaseVectorizationExecutor(
  next: KnowledgeBaseVectorizationExecutor,
): void {
  if (executor) {
    throw new Error('Knowledge base vectorization executor is already bound');
  }
  executor = next;
}

export function unbindKnowledgeBaseVectorizationExecutor(
  current: KnowledgeBaseVectorizationExecutor,
): void {
  if (!executor) return;
  if (executor !== current) {
    throw new Error('Knowledge base vectorization executor binding mismatch');
  }
  executor = undefined;
}

export default class KnowledgeBaseVectorizationJob extends Job<KnowledgeBaseVectorizationPayload> {
  public static options: JobOptions = {
    name: 'KnowledgeBaseVectorization',
    queue: 'default',
    timeout: 300_000,
  };

  public async execute(): Promise<void> {
    if (!executor) {
      throw new Error('Knowledge base vectorization executor is not bound');
    }
    if (this.payload.rebuildOnly) {
      await executor.reindexExistingSegments({
        documentId: this.payload.knowledgeBaseDocsId,
      });
      return;
    }
    await executor.vectorize({
      documentId: this.payload.knowledgeBaseDocsId,
      ...(this.payload.relatedQuestions
        ? { relatedQuestions: this.payload.relatedQuestions }
        : {}),
    });
  }
}
