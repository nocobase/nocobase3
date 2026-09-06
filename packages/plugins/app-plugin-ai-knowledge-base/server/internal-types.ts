export type SegmentOptions = {
  enabled: boolean;
  chunkSize: number;
  chunkOverlap: number;
};

export interface SegmentQuestion {
  id: string;
  content: string;
  enabled: boolean;
  hash: string;
}

export interface KnowledgeBaseVectorizationDispatcher {
  dispatch(options: {
    documentId: string | number;
    relatedQuestions?: readonly string[];
    rebuildOnly?: boolean;
  }): Promise<void>;
}
export interface KnowledgeBaseWarningLogger {
  warn(message: string, details: Record<string, unknown>): void;
}

export interface KnowledgeBaseVectorizationExecutor {
  vectorize(options: {
    documentId: string | number;
    relatedQuestions?: readonly string[];
  }): Promise<void>;
  reindexExistingSegments(options: {
    documentId: string | number;
  }): Promise<void>;
}
