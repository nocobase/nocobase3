import { describe, expect, it, vi } from 'vitest';

import KnowledgeBaseVectorizationJob, {
  bindKnowledgeBaseVectorizationExecutor,
  unbindKnowledgeBaseVectorizationExecutor,
} from '../server/jobs/knowledge-base-vectorization.js';
import type { KnowledgeBaseVectorizationExecutor } from '../server/internal-types.js';

function createJob(payload: {
  knowledgeBaseDocsId: string | number;
  relatedQuestions?: string[];
  rebuildOnly?: boolean;
}): KnowledgeBaseVectorizationJob {
  const job = new KnowledgeBaseVectorizationJob();
  job.$hydrate(payload, {
    jobId: 'job-1',
    attempt: 1,
    queue: 'default',
  } as never);
  return job;
}

describe('KnowledgeBaseVectorizationJob adapter', () => {
  it('fails explicitly when the provider has not bound an executor', async () => {
    await expect(
      createJob({ knowledgeBaseDocsId: 1 }).execute(),
    ).rejects.toThrow('Knowledge base vectorization executor is not bound');
  });

  it('preserves vectorize and rebuild-only payload semantics', async () => {
    const executor: KnowledgeBaseVectorizationExecutor = {
      vectorize: vi.fn().mockResolvedValue(undefined),
      reindexExistingSegments: vi.fn().mockResolvedValue(undefined),
    };
    bindKnowledgeBaseVectorizationExecutor(executor);
    try {
      await createJob({
        knowledgeBaseDocsId: 7,
        relatedQuestions: ['Why?'],
      }).execute();
      await createJob({ knowledgeBaseDocsId: 8, rebuildOnly: true }).execute();

      expect(executor.vectorize).toHaveBeenCalledWith({
        documentId: 7,
        relatedQuestions: ['Why?'],
      });
      expect(executor.reindexExistingSegments).toHaveBeenCalledWith({
        documentId: 8,
      });
      expect(KnowledgeBaseVectorizationJob.options).toMatchObject({
        name: 'KnowledgeBaseVectorization',
        queue: 'default',
        timeout: 300_000,
      });
    } finally {
      unbindKnowledgeBaseVectorizationExecutor(executor);
    }
  });

  it('rejects duplicate and mismatched bindings', () => {
    const first = {
      vectorize: vi.fn(),
      reindexExistingSegments: vi.fn(),
    } satisfies KnowledgeBaseVectorizationExecutor;
    const second = {
      vectorize: vi.fn(),
      reindexExistingSegments: vi.fn(),
    } satisfies KnowledgeBaseVectorizationExecutor;
    bindKnowledgeBaseVectorizationExecutor(first);
    try {
      expect(() => bindKnowledgeBaseVectorizationExecutor(second)).toThrow(
        'already bound',
      );
      expect(() => unbindKnowledgeBaseVectorizationExecutor(second)).toThrow(
        'binding mismatch',
      );
    } finally {
      unbindKnowledgeBaseVectorizationExecutor(first);
    }
  });
});
