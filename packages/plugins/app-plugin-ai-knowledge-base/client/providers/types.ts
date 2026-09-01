export type KnowledgeBaseType = 'LOCAL' | 'READONLY' | 'EXTERNAL';
export type RecordId = string | number;

/**
 * User-side shape. Its fields are a positive allowlist that the Portal server
 * adapter must project before data reaches this package; a TypeScript type is
 * not itself a security boundary.
 */
export type KnowledgeBase = {
  id: RecordId;
  key: string;
  name: string;
  description?: string;
  knowledgeBaseType: KnowledgeBaseType;
  documentCount?: number;
  characterCount?: number;
  aiEmployeeCount?: number;
  enabled: boolean;
  vectorStoreProvider?: string;
  vectorStoreConfigKey?: string;
  vectorDatabaseKey?: string;
  storageId?: string;
  llmService?: string;
  embeddingModel?: string;
  vectorStoreProps?: Array<{ name?: string; key: string; value: unknown }>;
  segmentOptions?: KnowledgeBaseSegmentOptions;
  createdAt?: string;
  updatedAt?: string;
};

export type KnowledgeBaseSegmentOptions = {
  enabled?: boolean;
  chunkSize?: number;
  chunkOverlap?: number;
};
export type KnowledgeBaseDocument = {
  id: RecordId;
  key?: string;
  title?: string;
  filename?: string;
  extname?: string;
  size?: number;
  mimetype?: string;
  /** Server-issued file URL. Resolve it against the NocoBase origin and fetch it with the active auth headers. */
  url?: string;
  preview?: string;
  knowledgeBaseKey: string;
  characterCount?: number;
  segmentCount?: number;
  segmentOptions?: KnowledgeBaseSegmentOptions;
  segmentStatus?: string;
  segmentErrorMessage?: string;
  segmentUpdatedAt?: string;
  enabled?: boolean;
  indexStatus?: string;
  errorMessage?: string;
  accessAbility?: 'readOnly' | 'readWrite';
  createdById?: RecordId;
  createdAt?: string;
  updatedAt?: string;
};

/** Search metadata must be explicitly modeled by an application before it is rendered. */
export type KnowledgeBaseSearchResult = {
  id?: RecordId;
  title?: string;
  filename?: string;
  content?: string;
  score?: number;
  matchedQuestions?: string[];
};

export type KnowledgeBaseSegmentQuestion = {
  id?: RecordId;
  content: string;
  enabled?: boolean;
  hash?: string;
};

export type KnowledgeBaseSegment = {
  uid: string;
  position?: number;
  title?: string;
  preview?: string;
  content?: string;
  charLength?: number;
  questionCount?: number;
  enabled?: boolean;
  contentHash?: string;
  updatedAt?: string;
  questions?: KnowledgeBaseSegmentQuestion[];
};

export type ZipFilenameEncodingOption = {
  value: string;
  label: string;
  description?: string;
  isDefault?: boolean;
};

export type UploadConstraints = {
  acceptedExtensions?: string[];
  maxFileSizeBytes?: number;
};

export type UploadResult =
  KnowledgeBaseDocument | { taskId: RecordId; message?: string };

export type PagedRequestMode =
  { mode: 'all' } | { mode: 'server'; page: number; pageSize: number };

export type KnowledgeBaseListRequest = PagedRequestMode & {
  query?: string;
  signal?: AbortSignal;
};

export type DocumentListRequest = PagedRequestMode & {
  knowledgeBaseKey: string;
  query?: string;
  signal?: AbortSignal;
};

export type SegmentListRequest = PagedRequestMode & {
  knowledgeBaseKey: string;
  documentId: RecordId;
  keyword?: string;
  enabled?: boolean;
  signal?: AbortSignal;
};

export type RetrievalRequest = {
  knowledgeBaseKey: string;
  query: string;
  topK?: number;
  score?: number;
  signal?: AbortSignal;
};

export type SegmentRequest = {
  knowledgeBaseKey: string;
  documentId: RecordId;
  segmentUid: string;
  signal?: AbortSignal;
};

export const isLocalKnowledgeBase = (value: KnowledgeBase) =>
  value.knowledgeBaseType === 'LOCAL';

/** Experience-only gate. The Portal server must enforce the same rule. */
export const canMaintainKnowledgeBaseDocuments = (
  value: KnowledgeBase | undefined,
) => !!value && isLocalKnowledgeBase(value);

export const isAsyncUploadResult = (
  value: UploadResult,
): value is { taskId: RecordId; message?: string } => 'taskId' in value;

/** Server-computed access may tailor an affordance; it never authorizes a request. */
export const canMaintainKnowledgeBaseDocument = (
  document: KnowledgeBaseDocument,
) => document.accessAbility === 'readWrite';

const processingDocumentStatuses = new Set(['PENDING', 'PROCESSING']);

export const isKnowledgeBaseDocumentProcessing = (
  document?: Pick<KnowledgeBaseDocument, 'indexStatus' | 'segmentStatus'>,
) =>
  [document?.indexStatus, document?.segmentStatus].some(
    (status) =>
      typeof status === 'string' &&
      processingDocumentStatuses.has(status.toUpperCase()),
  );

export type KnowledgeBaseMutation = {
  key?: string;
  name: string;
  description?: string;
  knowledgeBaseType: KnowledgeBaseType;
  enabled?: boolean;
  vectorStoreProvider?: string;
  vectorStoreConfigKey?: string;
  vectorDatabaseKey?: string;
  storageId?: string;
  llmService?: string;
  embeddingModel?: string;
  vectorStoreProps?: Array<{ name?: string; key: string; value: unknown }>;
  segmentOptions?: KnowledgeBaseSegmentOptions;
};
export type VectorDatabaseProviderField = {
  key: string;
  label?: string;
  type?: 'string' | 'number' | 'password' | 'boolean';
  required?: boolean;
  defaultValue?: unknown;
};

export type VectorDatabaseProvider = {
  name: string;
  spec: string;
  fields?: VectorDatabaseProviderField[];
};

export type VectorDatabase = {
  id: RecordId;
  key: string;
  name: string;
  databaseSpec: string;
  provider: string;
  connectProps: Record<string, unknown>;
  enabled: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type VectorDatabaseMutation = {
  key?: string;
  name: string;
  provider: string;
  databaseSpec?: string;
  connectProps: Record<string, unknown>;
  enabled?: boolean;
  skipTableExistedCheck?: boolean;
};

export type KnowledgeBaseManagementOption = {
  value: string;
  label: string;
};

export type KnowledgeBaseManagementOptions = {
  vectorDatabases: KnowledgeBaseManagementOption[];
  llmServices: KnowledgeBaseManagementOption[];
  storages: KnowledgeBaseManagementOption[];
  externalProviders: KnowledgeBaseManagementOption[];
};
