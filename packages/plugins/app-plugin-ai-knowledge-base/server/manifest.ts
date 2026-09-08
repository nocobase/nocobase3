import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

export type KnowledgeBaseManifestOperation = 'init' | 'append' | 'recover';
export type KnowledgeBaseManifestStatus =
  'PENDING' | 'PROCESSING' | 'SUCCESS' | 'FAILED';

export interface KnowledgeBaseManifest {
  readonly key: string;
  readonly operation: KnowledgeBaseManifestOperation;
  readonly initiate?: {
    readonly disk: string;
    readonly name: string;
    readonly vectorDatabase: string;
    readonly llmService: string;
    readonly embeddingModel: string;
    readonly description?: string;
  };
  readonly files: readonly {
    readonly disk: string;
    readonly locations: readonly string[];
  }[];
}

export interface KnowledgeBaseManifestSource {
  readonly disk: string;
  readonly location: string;
}

export interface KnowledgeBaseManifestApplyInput {
  readonly source: KnowledgeBaseManifestSource;
  readonly manifest: KnowledgeBaseManifest;
}

export interface ManifestFileRecord {
  readonly id: string | number;
  readonly manifestRecordId: string | number;
  readonly sourceDisk: string;
  readonly sourceLocation: string;
  readonly knowledgeBaseKey: string;
  readonly contentHash: string | null;
  readonly documentId: string | number | null;
  readonly documentKey: string | null;
  readonly status: KnowledgeBaseManifestStatus;
  readonly attemptCount: number;
  readonly failureReason: string | null;
  readonly createdAt?: Date | string;
  readonly updatedAt?: Date | string;
}

export interface ManifestRecord {
  readonly id: string | number;
  readonly sourceDisk: string;
  readonly sourceLocation: string;
  readonly knowledgeBaseKey: string;
  readonly knowledgeBaseId: string | number | null;
  readonly operation: KnowledgeBaseManifestOperation;
  readonly status: KnowledgeBaseManifestStatus;
  readonly manifestHash: string;
  readonly manifestSnapshot: KnowledgeBaseManifest;
  readonly attemptCount: number;
  readonly startedAt: Date | string | null;
  readonly finishedAt: Date | string | null;
  readonly errorMessage: string | null;
  readonly createdAt?: Date | string;
  readonly updatedAt?: Date | string;
  readonly files: readonly ManifestFileRecord[];
}

export interface KnowledgeBaseManifestService {
  apply(
    inputs: readonly KnowledgeBaseManifestApplyInput[],
  ): Promise<readonly ManifestRecord[]>;
  state(
    manifestRecordIds: readonly (string | number)[],
  ): Promise<readonly ManifestRecord[]>;
}

export const knowledgeBaseManifestServiceToken: ServiceToken<KnowledgeBaseManifestService> =
  createServiceToken<KnowledgeBaseManifestService>(
    '@nocobase/app-plugin-ai-knowledge-base/manifest-service',
  );
