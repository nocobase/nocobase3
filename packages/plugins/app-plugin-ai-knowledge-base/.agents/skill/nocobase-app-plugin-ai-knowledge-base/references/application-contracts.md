# Application Contracts

## Contents

- [Core data types](#core-data-types)
- [Request and mutation types](#request-and-mutation-types)
- [KnowledgeBaseService](#knowledgebaseservice)
- [React hooks](#react-hooks)
- [Pagination and errors](#pagination-and-errors)
- [Route and settings contracts](#route-and-settings-contracts)
- [End-to-end examples](#end-to-end-examples)

## Core data types

All imports below are public:

```ts
import {
  knowledgeBaseService,
  isAsyncUploadResult,
  type KnowledgeBase,
  type KnowledgeBaseDocument,
  type KnowledgeBaseSegment,
  type KnowledgeBaseService,
  type VectorDatabase,
} from '@nocobase/app-plugin-ai-knowledge-base/client';
```

```ts
type RecordId = string | number;
type KnowledgeBaseType = 'LOCAL' | 'READONLY' | 'EXTERNAL';

type KnowledgeBaseSegmentOptions = {
  enabled?: boolean;
  chunkSize?: number;
  chunkOverlap?: number;
};

type KnowledgeBase = {
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

type KnowledgeBaseDocument = {
  id: RecordId;
  key?: string;
  title?: string;
  filename?: string;
  extname?: string;
  size?: number;
  mimetype?: string;
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

type KnowledgeBaseSegmentQuestion = {
  id?: RecordId;
  content: string;
  enabled?: boolean;
  hash?: string;
};

type KnowledgeBaseSegment = {
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

type KnowledgeBaseSearchResult = {
  id?: RecordId;
  title?: string;
  filename?: string;
  content?: string;
  score?: number;
  matchedQuestions?: string[];
};

type UploadResult =
  KnowledgeBaseDocument | { taskId: RecordId; message?: string };
type UploadConstraints = {
  acceptedExtensions?: string[];
  maxFileSizeBytes?: number;
};
type ZipFilenameEncodingOption = {
  value: string;
  label: string;
  description?: string;
  isDefault?: boolean;
};

type VectorDatabase = {
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

type VectorDatabaseProviderField = {
  key: string;
  label?: string;
  type?: 'string' | 'number' | 'password' | 'boolean';
  required?: boolean;
  defaultValue?: unknown;
};
type VectorDatabaseProvider = {
  name: string;
  spec: string;
  fields?: VectorDatabaseProviderField[];
};
```

`KnowledgeBase` and document shapes are positive client projections. They are not authorization boundaries. Server records contain additional fields that the default adapter intentionally does not expose.

## Request and mutation types

```ts
type PagedRequestMode =
  { mode: 'all' } | { mode: 'server'; page: number; pageSize: number };

type KnowledgeBaseListRequest = PagedRequestMode & {
  query?: string;
  signal?: AbortSignal;
};
type DocumentListRequest = PagedRequestMode & {
  knowledgeBaseKey: string;
  query?: string;
  signal?: AbortSignal;
};
type SegmentListRequest = PagedRequestMode & {
  knowledgeBaseKey: string;
  documentId: RecordId;
  keyword?: string;
  enabled?: boolean;
  signal?: AbortSignal;
};
type RetrievalRequest = {
  knowledgeBaseKey: string;
  query: string;
  topK?: number;
  score?: number;
  signal?: AbortSignal;
};
type SegmentRequest = {
  knowledgeBaseKey: string;
  documentId: RecordId;
  segmentUid: string;
  signal?: AbortSignal;
};

type KnowledgeBaseMutation = {
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

type VectorDatabaseMutation = {
  key?: string;
  name: string;
  provider: string;
  databaseSpec?: string;
  connectProps: Record<string, unknown>;
  enabled?: boolean;
  skipTableExistedCheck?: boolean;
};
```

Mutation normalization trims text, defaults `enabled` to true, omits empty optional strings, and normalizes vector-database `port` to a number. On an edit, hidden/non-visible fields can be preserved by `normalizeKnowledgeBaseMutation(values, existing, visibleFields)` or `normalizeVectorDatabaseMutation(...)`.

Server segment options normalize to: enabled unless exactly false; `chunkSize` integer-like numeric coercion clamped 1..100000, default 6000; `chunkOverlap` numeric coercion clamped 0..`chunkSize-1`, default 1200. Because `Number(value) || default` is used, an explicit overlap of 0 currently becomes 1200 before the upper clamp. For `chunkSize <= 1200`, overlap becomes `chunkSize - 1`.

## KnowledgeBaseService

```ts
interface KnowledgeBaseService {
  createKnowledgeBase(values: KnowledgeBaseMutation): Promise<KnowledgeBase>;
  updateKnowledgeBase(
    id: RecordId,
    values: Partial<KnowledgeBaseMutation>,
  ): Promise<KnowledgeBase>;
  deleteKnowledgeBase(id: RecordId): Promise<unknown>;

  listKnowledgeBaseManagementOptions(): Promise<{
    vectorDatabases: Array<{ value: string; label: string }>;
    llmServices: Array<{ value: string; label: string }>;
    storages: Array<{ value: string; label: string }>;
    externalProviders: Array<{ value: string; label: string }>;
  }>;
  listEmbeddingModels(
    llmService: string,
  ): Promise<Array<{ value: string; label: string }>>;

  listKnowledgeBases(
    request: KnowledgeBaseListRequest,
  ): Promise<PagedResult<KnowledgeBase>>;
  getKnowledgeBase(key: string, signal?: AbortSignal): Promise<KnowledgeBase>;
  listDocuments(
    request: DocumentListRequest,
  ): Promise<PagedResult<KnowledgeBaseDocument>>;
  getDocument(request: {
    knowledgeBaseKey: string;
    documentId: RecordId;
    signal?: AbortSignal;
  }): Promise<KnowledgeBaseDocument>;

  getUploadConstraints(request: {
    knowledgeBaseKey: string;
    signal?: AbortSignal;
  }): Promise<UploadConstraints>;
  getZipFilenameEncodingOptions(request: {
    knowledgeBaseKey: string;
    signal?: AbortSignal;
  }): Promise<ZipFilenameEncodingOption[]>;
  uploadDocument(request: {
    knowledgeBaseKey: string;
    file: File;
    zipFilenameEncodings?: string[];
  }): Promise<UploadResult>;
  vectorizeDocuments(request: {
    knowledgeBaseKey: string;
    documentIds?: RecordId[];
  }): Promise<unknown>;
  deleteDocuments(request: { documentIds: RecordId[] }): Promise<unknown>;

  listSegments(
    request: SegmentListRequest,
  ): Promise<PagedResult<KnowledgeBaseSegment>>;
  getSegment(
    request: SegmentRequest,
  ): Promise<KnowledgeBaseSegment | undefined>;
  updateSegment(request: {
    knowledgeBaseKey: string;
    documentId: RecordId;
    segmentUid: string;
    title?: string;
    content: string;
    contentHash: string;
  }): Promise<KnowledgeBaseSegment>;
  updateQuestions(request: {
    knowledgeBaseKey: string;
    documentId: RecordId;
    segmentUid: string;
    questions: KnowledgeBaseSegment['questions'];
    contentHash: string;
  }): Promise<KnowledgeBaseSegment>;
  setSegmentEnabled(request: {
    knowledgeBaseKey: string;
    documentId: RecordId;
    segmentUid: string;
    enabled: boolean;
  }): Promise<KnowledgeBaseSegment>;
  deleteSegment(request: {
    knowledgeBaseKey: string;
    documentId: RecordId;
    segmentUid: string;
  }): Promise<unknown>;
  regenerateSegments(request: {
    knowledgeBaseKey: string;
    documentId: RecordId;
    segmentOptions?: KnowledgeBaseSegmentOptions;
  }): Promise<unknown>;
  runRetrieval(request: RetrievalRequest): Promise<KnowledgeBaseSearchResult[]>;

  listVectorDatabaseProviders(): Promise<VectorDatabaseProvider[]>;
  listVectorDatabases(
    request: PagedRequestMode & { signal?: AbortSignal },
  ): Promise<PagedResult<VectorDatabase>>;
  getVectorDatabase(
    id: RecordId,
    signal?: AbortSignal,
  ): Promise<VectorDatabase>;
  createVectorDatabase(values: VectorDatabaseMutation): Promise<VectorDatabase>;
  updateVectorDatabase(
    id: RecordId,
    values: Partial<VectorDatabaseMutation>,
  ): Promise<VectorDatabase>;
  deleteVectorDatabase(id: RecordId): Promise<unknown>;
  testVectorDatabaseConnection(
    values: Pick<VectorDatabaseMutation, 'provider' | 'connectProps'>,
  ): Promise<{ success: boolean; error?: string }>;
  listEnabledVectorDatabases(): Promise<VectorDatabase[]>;
  findRelatedKnowledgeBases(
    vectorDatabaseKey: string,
  ): Promise<KnowledgeBase[]>;
}

type PagedResult<T> = {
  rows: T[];
  count: number;
  page: number;
  pageSize: number;
};
```

All methods are asynchronous and reject when the action client rejects, a required response field is absent, an enum is invalid, or a client-side upload check fails. Abort-aware reads pass `AbortSignal` to the action client. The adapter validates response projections and throws messages such as `Knowledge Base API response is missing required field: ...`.

`listKnowledgeBaseManagementOptions()` calls enabled vector databases, embedding-capable LLM services, and external providers concurrently. Its storage result is currently only `{value:'0',label:'Default'}`. `listEmbeddingModels` sends `model=EMBEDDING`.

`uploadDocument` first obtains upload storage. It rejects unsupported extensions or a file larger than the returned rule. Local storage sends multipart with the key in query and form. An `s3-compatible` storage path requests a presigned URL, performs a direct `PUT`, then sends a flat finalize body. Current server `getUploadStorage` reports local/default storage, so the S3 branch is compatibility behavior.

## React hooks

Each request state is:

```ts
type AsyncState<T> = {
  data?: T;
  error?: unknown;
  loading: boolean;
  retry: () => void;
};
```

Requests abort on logical key changes and discard stale responses.

```ts
useKnowledgeBase(options?: {
  knowledgeBaseKey?: string;
  knowledgeBase?: KnowledgeBase;
  directory?: { mode?: 'all' | 'paginated' | 'infinite'; page?: number; pageSize?: number; query?: string; enabled?: boolean };
  retrieval?: Omit<RetrievalRequest, 'knowledgeBaseKey' | 'signal'> & { enabled?: boolean };
});
```

Defaults: directory page 1, page size 20; retrieval only runs with a resolved base and nonblank query. Result contains `{service, knowledgeBase, directory:{all,paginated,infinite}, retrieval}`. Infinite state adds `rows,count,loading,loadingMore,error,hasMore,loadMore,retry`.

```ts
useKnowledgeBaseDocument(options?: {
  knowledgeBaseKey?: string;
  documentId?: RecordId;
  documents?: { mode?: 'all' | 'paginated'; page?: number; pageSize?: number; query?: string; enabled?: boolean };
  document?: { enabled?: boolean };
  upload?: { enabled?: boolean; includeConstraints?: boolean; includeZipEncodingOptions?: boolean };
});
```

Defaults: page 1, page size 20. Upload constraints are fetched when an `upload` option exists unless explicitly disabled; ZIP options only when explicitly true. Result contains `{service,documents:{all,paginated},document,upload:{constraints,zipEncodingOptions}}`.

```ts
useKnowledgeBaseSegment(options?: {
  knowledgeBaseKey?: string;
  documentId?: RecordId;
  segmentUid?: string;
  segments?: { page?: number; pageSize?: number; keyword?: string; enabledOnly?: boolean; enabled?: boolean };
  segment?: { enabled?: boolean };
});
```

Defaults page 1/page size 20. `enabledOnly` sends `enabled=true`. Result is `{service,segments,segment}`.

Use `KnowledgeBaseServiceProvider({service,children})` to replace the service for an authorized proxy or test. `useKnowledgeBaseService()` reads it. The default is `knowledgeBaseService`.

## Pagination and errors

Server list defaults: page 1, pageSize 20, maximum 200, minimum 1. `paginate=false` removes limit/offset but response meta still reports page/pageSize. Server sort is fixed to `-createdAt`; caller sort is ignored. The client sends `paginate=false` for `mode:'all'`.

List response normalization accepts arrays and common `data/meta`, nested `data.data/data.meta`, and `rows/count` envelopes. The actual plugin list envelope is:

```json
{ "data": { "data": [], "meta": { "count": 0, "page": 1, "pageSize": 20 } } }
```

Normal object responses are `{"data":{...}}`; errors are `{"errors":[{"message":"..."}]}`.

`normalizeKnowledgeBaseError(error, fallback?)` returns `{status?,message,conflict,forbidden,unavailable}`. `conflict` means 409; `forbidden` means 403; `unavailable` means 204 or 404.

## Route and settings contracts

Path helpers:

```ts
knowledgeBaseWorkspacePath(key);
knowledgeBaseDocumentPath(key, documentId);
knowledgeBaseSegmentPath(key, documentId, segmentUid);
knowledgeBaseUploadPath(key);
knowledgeBaseRetrievalPath(key, resultIndex);
```

They URL-encode dynamic parts. The package also re-exports AI Employee path constants for list/settings/vector pages.

Settings tabs register automatically with keys `knowledge-base` and `vector-database`. `KnowledgeBaseSettingsPage` hosts list/workspace/document/upload/retrieval/segment/vector routes in a memory router. `VectorDatabaseSettingsPage` renders the vector page. Client bootstrap imports locale registration; applications normally do not invoke it.

## End-to-end examples

### Read and create a LOCAL knowledge base

```ts
const list = await knowledgeBaseService.listKnowledgeBases({
  mode: 'server',
  page: 1,
  pageSize: 20,
});

const local = await knowledgeBaseService.createKnowledgeBase({
  name: 'Product manuals',
  knowledgeBaseType: 'LOCAL',
  vectorDatabaseKey: 'vector-db-key',
  llmService: 'embedding-service-name',
  embeddingModel: 'embedding-model-id',
  segmentOptions: { enabled: true, chunkSize: 6000, chunkOverlap: 1200 },
});
```

`name` is required by the client type. The server generates base key, outer ID, and vector-store config key when omitted. A LOCAL base defaults to `NocobaseLocalVectorStoreProvider`.

### Upload and observe processing

```ts
const result = await knowledgeBaseService.uploadDocument({
  knowledgeBaseKey: local.key,
  file,
  zipFilenameEncodings: file.name.toLowerCase().endsWith('.zip')
    ? ['utf8']
    : undefined,
});

if (isAsyncUploadResult(result)) {
  console.info('Upload task queued', result.taskId, result.message);
} else {
  console.info('Document queued', result.id, result.indexStatus);
}

const documents = await knowledgeBaseService.listDocuments({
  mode: 'server',
  page: 1,
  pageSize: 20,
  knowledgeBaseKey: local.key,
});
```

Poll with bounded backoff until `indexStatus` and `segmentStatus` are SUCCESS or ERROR. Do not treat upload Promise resolution as vectorization completion.

### Segments and retrieval

```ts
const segments = await knowledgeBaseService.listSegments({
  mode: 'server',
  page: 1,
  pageSize: 20,
  knowledgeBaseKey: local.key,
  documentId,
  enabled: true,
});

const hits = await knowledgeBaseService.runRetrieval({
  knowledgeBaseKey: local.key,
  query: 'How do I reset the device?',
  topK: 3,
  score: 0.7,
});
```

The route requires key and query. Current server does not enforce a numeric range for topK/score; validate positive topK and a backend-appropriate similarity threshold in application code.

### Create/test PGVector

```ts
const provider = 'NocobaseDefaultPGVectorProvider';
const connectProps = {
  host: process.env.PGVECTOR_HOST,
  port: Number(process.env.PGVECTOR_PORT),
  user: process.env.PGVECTOR_USER,
  password: process.env.PGVECTOR_PASSWORD,
  database: process.env.PGVECTOR_DATABASE,
  tableName: 'ai_product_manual_vectors',
};

const test = await knowledgeBaseService.testVectorDatabaseConnection({
  provider,
  connectProps,
});
if (!test.success) throw new Error(test.error ?? 'PGVector connection failed');

const vectorDb = await knowledgeBaseService.createVectorDatabase({
  name: 'Product manual vectors',
  provider,
  databaseSpec: 'PGVector',
  connectProps,
});
```

Never execute this example in browser code with real secrets. Run through an authorized server-side integration.

### Safe delete

```ts
const related = await knowledgeBaseService.findRelatedKnowledgeBases(
  vectorDb.key,
);
if (related.length) throw new Error('Vector database is still referenced');
// Require explicit operator confirmation here.
await knowledgeBaseService.deleteVectorDatabase(vectorDb.id);
```

For documents or bases, require confirmation, record IDs/keys, back up data/files, call the service delete, then verify records, durable files, statistics, and vector rows.
