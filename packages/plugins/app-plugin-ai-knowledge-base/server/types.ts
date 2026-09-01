import type { AIManager, FileStorageFactory } from '@nocobase/ai-employee';
import type { DatabaseConnection, DatabaseManager } from '@nocobase/db';
import type { NocoBaseQueueManager } from '@nocobase/queue';

export type SegmentOptions = {
  enabled: boolean;
  chunkSize: number;
  chunkOverlap: number;
};
export type KnowledgeBaseType = 'LOCAL' | 'READONLY' | 'EXTERNAL';
export type JsonRecord = Record<string, unknown>;

export interface KnowledgeBaseRecord extends JsonRecord {
  id: string | number;
  key: string;
  knowledgeBaseType: KnowledgeBaseType;
  knowledgeBaseOuterId: string;
  name: string;
  description?: string;
  vectorStoreProvider: string;
  disk: string;
  vectorStoreConfigKey?: string;
  vectorStoreProps?: Array<{ name?: string; key: string; value: unknown }>;
  segmentOptions: SegmentOptions;
  documentCount: number;
  characterCount: number;
  aiEmployeeCount: number;
  enabled: boolean;
  confirmVectorStoreChanged?: Date | string;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

export interface KnowledgeBaseDocumentRecord extends JsonRecord {
  id: string | number;
  key: string;
  title?: string;
  filename: string;
  extname: string;
  size: number;
  mimetype: string;
  path: string;
  url?: string;
  preview?: string;
  disk: string;
  meta: JsonRecord;
  knowledgeBaseKey: string;
  indexStatus: string;
  errorMessage?: string | null;
  characterCount: number;
  segmentCount: number;
  segmentVersion?: number;
  segmentRevision: number;
  segmentStatus?: string | null;
  segmentErrorMessage?: string | null;
  segmentUpdatedAt?: Date | string | null;
  segmentOptions: SegmentOptions;
  enabled: boolean;
  createdById?: string | number;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

export interface SegmentQuestion extends JsonRecord {
  id: string;
  content: string;
  enabled: boolean;
  hash: string;
}

export interface SegmentRecord extends JsonRecord {
  id: string | number;
  uid: string;
  knowledgeBaseKey: string;
  knowledgeBaseOuterId?: string;
  knowledgeBaseDocsId: string | number;
  shardId: string | number;
  shardNo: number;
  contentKey: string;
  position: number;
  title?: string;
  preview?: string;
  contentHash: string;
  charLength: number;
  questionCount: number;
  enabled: boolean;
  segmentVersion: number;
  meta: JsonRecord;
  updatedAt?: Date | string;
}

export interface SegmentShardRecord extends JsonRecord {
  id: string | number;
  knowledgeBaseKey: string;
  knowledgeBaseDocsId: string | number;
  shardNo: number;
  segmentVersion: number;
  segmentCount: number;
  contentHash: string;
  filename: string;
  extname: string;
  path: string;
  url?: string;
  size: number;
  mimetype: string;
  disk: string;
  meta: JsonRecord;
}

export interface VectorDatabaseRecord extends JsonRecord {
  id: string | number;
  key: string;
  name: string;
  databaseSpec: string;
  provider: string;
  connectProps: JsonRecord;
  connectPropsHash?: string;
  enabled: boolean;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

export interface VectorStoreConfigRecord extends JsonRecord {
  id: string | number;
  key: string;
  name: string;
  vectorDatabaseKey?: string;
  vectorDatabaseId?: string;
  llmService?: string;
  embeddingModel: string;
  enabled: boolean;
}

export interface KnowledgeBasePluginDeps {
  ai: AIManager;
  database: DatabaseManager;
  fileStorageFactory: FileStorageFactory;
  allowedStorageDisks: readonly string[];
  queueManager: NocoBaseQueueManager;
}

export interface KnowledgeBasePluginRuntime {
  ai: AIManager;
  database: DatabaseConnection;
  fileStorageFactory: FileStorageFactory;
  allowedStorageDisks: readonly string[];
  queueManager: NocoBaseQueueManager;
}
