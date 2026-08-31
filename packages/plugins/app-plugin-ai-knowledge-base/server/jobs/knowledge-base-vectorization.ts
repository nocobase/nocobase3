import { Job, type JobOptions } from '@nocobase/queue';
import type { KnowledgeBaseService } from '../service.js';

export interface KnowledgeBaseVectorizationPayload {
  knowledgeBaseDocsId: string | number;
  relatedQuestions?: string[];
  rebuildOnly?: boolean;
}

let runtime: KnowledgeBaseService | undefined;
export function registerVectorizationRuntime(
  service: KnowledgeBaseService,
): void {
  runtime = service;
}

export default class KnowledgeBaseVectorizationJob extends Job<KnowledgeBaseVectorizationPayload> {
  static options: JobOptions = {
    name: 'KnowledgeBaseVectorization',
    queue: 'default',
    timeout: 300_000,
  };
  async execute(): Promise<void> {
    if (!runtime)
      throw new Error('Knowledge base vectorization runtime is not registered');
    if (this.payload.rebuildOnly)
      await runtime.reindexExistingSegments(this.payload.knowledgeBaseDocsId);
    else
      await runtime.vectorize(
        this.payload.knowledgeBaseDocsId,
        this.payload.relatedQuestions,
      );
  }
}
