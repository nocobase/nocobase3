import { expect, test } from 'vitest';

import { createKnowledgeBaseService } from '../client/providers/service/knowledge-base-factory.ts';

type Call = {
  resource: string;
  action: string;
  options?: Record<string, unknown>;
};

function recordingClient(respond: (call: Call) => unknown): {
  calls: Call[];
  client: {
    action<T>(
      resource: string,
      action: string,
      options?: Record<string, unknown>,
    ): Promise<T>;
  };
} {
  const calls: Call[] = [];
  return {
    calls,
    client: {
      async action<T>(
        resource: string,
        action: string,
        options?: Record<string, unknown>,
      ): Promise<T> {
        const call = { resource, action, options };
        calls.push(call);
        return respond(call) as T;
      },
    },
  };
}

const base = {
  id: 1,
  key: 'handbook',
  name: 'Handbook',
  knowledgeBaseType: 'LOCAL',
  enabled: true,
};

const document = {
  id: 2,
  knowledgeBaseKey: 'handbook',
  title: 'Policies',
  accessAbility: 'readWrite',
};

test('directory, detail, document, retrieval, and segment reads use the server resources', async () => {
  const { calls, client } = recordingClient(({ action }) => {
    if (action === 'runHitTest')
      return { data: [{ id: 3, content: 'match', score: 0.9 }] };
    if (action === 'getSegment')
      return {
        data: { uid: 'segment-1', content: 'body', contentHash: 'hash-1' },
      };
    if (action === 'get') return { data: document };
    if (action === 'list')
      return {
        data: {
          data: action === 'list' ? [base] : [],
          meta: { count: 1, page: 1, pageSize: 20 },
        },
      };
    return { data: [] };
  });
  const service = createKnowledgeBaseService(client);

  await service.listKnowledgeBases({
    mode: 'server',
    page: 1,
    pageSize: 20,
    query: 'Hand',
  });
  await service.getKnowledgeBase('handbook');
  await service.getDocument({ knowledgeBaseKey: 'handbook', documentId: 2 });
  await service.runRetrieval({
    knowledgeBaseKey: 'handbook',
    query: 'retention',
    topK: 4,
    score: 0.6,
  });
  await service.getSegment({
    knowledgeBaseKey: 'handbook',
    documentId: 2,
    segmentUid: 'segment-1',
  });

  expect(calls.map(({ resource, action }) => `${resource}:${action}`)).toEqual([
    'aiKnowledgeBase:list',
    'aiKnowledgeBase:list',
    'aiKnowledgeBaseDocs:get',
    'aiKnowledgeBase:runHitTest',
    'aiKnowledgeBaseDocSegments:getSegment',
  ]);
  expect(calls[0]?.options?.query).toMatchObject({
    page: 1,
    pageSize: 20,
    'filter[name][$includes]': 'Hand',
  });
  expect(calls[1]?.options?.query).toEqual({
    paginate: false,
    'filter[key]': 'handbook',
  });
  expect(calls[3]?.options?.body).toEqual({
    knowledgeBaseKey: 'handbook',
    query: 'retention',
    topK: 4,
    score: 0.6,
  });
});

test('multipart upload sends the knowledge base key in query and form data', async () => {
  const { calls, client } = recordingClient(({ action }) => {
    if (action === 'getUploadStorage')
      return { data: { id: 9, type: 'local', rules: { size: 1024 } } };
    if (action === 'upload') return { data: document };
    return { data: [] };
  });
  const service = createKnowledgeBaseService(client);
  const file = new File(['content'], 'guide.txt', { type: 'text/plain' });

  await service.uploadDocument({ knowledgeBaseKey: 'handbook', file });

  const upload = calls.find(({ action }) => action === 'upload');
  expect(upload?.options?.query).toEqual({ knowledgeBaseKey: 'handbook' });
  expect(upload?.options?.body).toBeInstanceOf(FormData);
  const form = upload?.options?.body as FormData;
  expect(form.get('knowledgeBaseKey')).toBe('handbook');
  expect((form.get('file') as File).name).toBe('guide.txt');
});

test('segment updates preserve the latest content hash in the request body', async () => {
  const { calls, client } = recordingClient(() => ({
    data: { uid: 'segment-1', contentHash: 'hash-2' },
  }));
  const service = createKnowledgeBaseService(client);

  await service.updateSegment({
    knowledgeBaseKey: 'handbook',
    documentId: 2,
    segmentUid: 'segment-1',
    content: 'updated',
    contentHash: 'hash-1',
  });
  await service.updateQuestions({
    knowledgeBaseKey: 'handbook',
    documentId: 2,
    segmentUid: 'segment-1',
    questions: [{ content: 'Question?' }],
    contentHash: 'hash-2',
  });

  expect(calls[0]?.options?.body).toMatchObject({
    knowledgeBaseDocsId: 2,
    contentHash: 'hash-1',
  });
  expect(calls[1]?.options?.body).toMatchObject({
    knowledgeBaseDocsId: 2,
    contentHash: 'hash-2',
  });
});

test('knowledge base management actions use flat create, update, delete, and enabled payloads', async () => {
  const { calls, client } = recordingClient(({ action }) => {
    if (action === 'listEnabled')
      return { data: [{ key: 'vector', name: 'Vector' }] };
    if (action === 'listLLMProviders')
      return { data: [{ name: 'openai', supportedModel: ['EMBEDDING'] }] };
    if (action === 'listAllEnabledModels')
      return {
        data: [
          {
            llmService: 'embedding-service',
            llmServiceTitle: 'Embedding service',
            provider: 'openai',
            enabledModels: ['text-embedding-3-small'],
          },
        ],
      };
    if (action === 'listExternalVectorStoreProviders')
      return { data: ['ExternalProvider'] };
    if (action === 'listStorages')
      return { data: [{ value: 'default', label: 'Default' }] };
    if (action === 'destroy') return { data: { success: true } };
    return {
      data: { ...base, name: action === 'update' ? 'Updated' : base.name },
    };
  });
  const service = createKnowledgeBaseService(client);

  await service.createKnowledgeBase({
    key: 'handbook',
    name: ' Handbook ',
    knowledgeBaseType: 'LOCAL',
    enabled: true,
    storageId: 'default',
    vectorDatabaseKey: 'vector',
    llmService: 'embedding-service',
    embeddingModel: 'text-embedding-3-small',
  });
  await service.updateKnowledgeBase(1, { enabled: false });
  await service.deleteKnowledgeBase(1);
  await expect(service.listKnowledgeBaseManagementOptions()).resolves.toEqual({
    vectorDatabases: [{ value: 'vector', label: 'Vector' }],
    llmServices: [{ value: 'embedding-service', label: 'Embedding service' }],
    storages: [{ value: 'default', label: 'Default' }],
    externalProviders: [
      { value: 'ExternalProvider', label: 'ExternalProvider' },
    ],
  });
  await expect(
    service.listEmbeddingModels('embedding-service'),
  ).resolves.toEqual([
    { value: 'text-embedding-3-small', label: 'text-embedding-3-small' },
  ]);

  expect(calls[0]).toMatchObject({
    resource: 'aiKnowledgeBase',
    action: 'create',
    options: {
      body: {
        key: 'handbook',
        name: 'Handbook',
        knowledgeBaseType: 'LOCAL',
        enabled: true,
        storageId: 'default',
        vectorDatabaseKey: 'vector',
        llmService: 'embedding-service',
        embeddingModel: 'text-embedding-3-small',
      },
    },
  });
  expect(calls[1]).toMatchObject({
    resource: 'aiKnowledgeBase',
    action: 'update',
    options: { query: { filterByTk: 1 }, body: { enabled: false } },
  });
  expect(calls[2]).toMatchObject({
    resource: 'aiKnowledgeBase',
    action: 'destroy',
    options: { query: { 'filterByTk[]': [1] } },
  });
});

test('vector database management uses plugin-owned service actions', async () => {
  const vector = {
    id: 5,
    key: 'primary',
    name: 'Primary',
    databaseSpec: 'PGVector',
    provider: 'NocobaseDefaultPGVectorProvider',
    connectProps: { host: 'localhost', port: 5432 },
    enabled: true,
  };
  const { calls, client } = recordingClient(({ action }) => {
    if (action === 'listProviders') {
      return {
        data: [
          {
            name: vector.provider,
            spec: vector.databaseSpec,
            fields: [{ key: 'host', required: true }],
          },
        ],
      };
    }
    if (action === 'list') {
      return {
        data: {
          data: [vector],
          meta: { count: 1, page: 1, pageSize: 20 },
        },
      };
    }
    if (action === 'findRelatedKnowledgeBase') return { data: [base] };
    if (action === 'testConnection') return { data: { success: true } };
    if (action === 'destroy') return { data: { success: true } };
    return { data: vector };
  });
  const service = createKnowledgeBaseService(client);

  await expect(service.listVectorDatabaseProviders()).resolves.toEqual([
    {
      name: vector.provider,
      spec: vector.databaseSpec,
      fields: [{ key: 'host', required: true }],
    },
  ]);
  await expect(
    service.listVectorDatabases({ mode: 'server', page: 1, pageSize: 20 }),
  ).resolves.toMatchObject({ rows: [vector], count: 1 });
  await service.getVectorDatabase(5);
  await service.createVectorDatabase({
    key: ' primary ',
    name: ' Primary ',
    provider: vector.provider,
    databaseSpec: vector.databaseSpec,
    connectProps: { host: 'localhost', port: '5432' },
    enabled: true,
  });
  await service.updateVectorDatabase(5, { enabled: false });
  await service.testVectorDatabaseConnection({
    provider: vector.provider,
    connectProps: { host: 'localhost' },
  });
  await service.findRelatedKnowledgeBases(vector.key);
  await service.deleteVectorDatabase(5);

  expect(calls.map(({ action }) => action)).toEqual([
    'listProviders',
    'list',
    'get',
    'create',
    'update',
    'testConnection',
    'findRelatedKnowledgeBase',
    'destroy',
  ]);
  expect(calls[3]?.options?.body).toMatchObject({
    key: 'primary',
    name: 'Primary',
    connectProps: { host: 'localhost', port: 5432 },
  });
  expect(calls[7]?.options?.query).toEqual({ 'filterByTk[]': [5] });
});
