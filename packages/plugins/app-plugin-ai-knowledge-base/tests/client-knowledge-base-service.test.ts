import { expect, test, vi } from 'vitest';

import { createKnowledgeBaseService } from '../client/providers/service/knowledge-base-factory.ts';
import { SUPPORTED_KNOWLEDGE_BASE_DOCUMENT_EXTENSIONS } from '../client/providers/types.ts';

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

test('normalizes database boolean values in knowledge base responses', async () => {
  const { client } = recordingClient(() => ({
    data: {
      data: [
        { ...base, key: 'enabled', enabled: 1 },
        { ...base, id: 2, key: 'disabled', enabled: 0 },
      ],
      meta: { count: 2, page: 1, pageSize: 20 },
    },
  }));
  const service = createKnowledgeBaseService(client);

  await expect(
    service.listKnowledgeBases({ mode: 'all' }),
  ).resolves.toMatchObject({
    rows: [
      { key: 'enabled', enabled: true },
      { key: 'disabled', enabled: false },
    ],
  });
});

test('normalizes numeric database timestamps before rendering dates', async () => {
  const timestamp = 1_725_000_000_000;
  const { client } = recordingClient(() => ({
    data: {
      data: [
        {
          ...base,
          createdAt: timestamp,
          updatedAt: String(timestamp),
        },
      ],
      meta: { count: 1, page: 1, pageSize: 20 },
    },
  }));
  const service = createKnowledgeBaseService(client);

  await expect(
    service.listKnowledgeBases({ mode: 'all' }),
  ).resolves.toMatchObject({
    rows: [
      {
        createdAt: new Date(timestamp).toISOString(),
        updatedAt: new Date(timestamp).toISOString(),
      },
    ],
  });
});
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
    'ai/aiKnowledgeBase:list',
    'ai/aiKnowledgeBase:list',
    'ai/aiKnowledgeBaseDocs:get',
    'ai/aiKnowledgeBase:runHitTest',
    'ai/aiKnowledgeBaseDocSegments:getSegment',
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

const uploadConstraints = {
  acceptedExtensions: [...SUPPORTED_KNOWLEDGE_BASE_DOCUMENT_EXTENSIONS],
  maxFileSizeBytes: 1024,
};

function uploadClient(response: unknown = document) {
  return recordingClient(({ action }) => {
    if (action === 'getUploadStorage') return { data: uploadConstraints };
    if (action === 'upload') return { data: response };
    return { data: [] };
  });
}

test('upload constraints expose the exact eleven supported extensions and size limit', async () => {
  const { calls, client } = recordingClient(() => ({
    data: {
      ...uploadConstraints,
      disk: 'private-storage',
      type: 's3-compatible',
    },
  }));
  const service = createKnowledgeBaseService(client);
  const signal = new AbortController().signal;

  const constraints = await service.getUploadConstraints({
    knowledgeBaseKey: 'handbook',
    signal,
  });

  expect(constraints).toEqual(uploadConstraints);
  expect(constraints).not.toHaveProperty('disk');
  expect(constraints).not.toHaveProperty('type');
  expect(calls).toEqual([
    {
      resource: 'ai/aiKnowledgeBaseDocs',
      action: 'getUploadStorage',
      options: {
        method: 'GET',
        query: { knowledgeBaseKey: 'handbook' },
        signal,
        unwrap: 'none',
      },
    },
  ]);
});

test('upload constraints use the exact local fallback without legacy storage fields', async () => {
  const { client } = recordingClient(() => ({
    data: {
      disk: 'private-storage',
      type: 's3-compatible',
      rules: { size: 2048 },
    },
  }));
  const service = createKnowledgeBaseService(client);

  await expect(
    service.getUploadConstraints({ knowledgeBaseKey: 'handbook' }),
  ).resolves.toEqual({
    acceptedExtensions: [...SUPPORTED_KNOWLEDGE_BASE_DOCUMENT_EXTENSIONS],
  });
});

test('upload constraints normalize case and discard unsupported advertised extensions', async () => {
  const { client } = recordingClient(() => ({
    data: {
      acceptedExtensions: ['.PDF', '.zip', ' .XLSX ', '.PDF'],
      maxFileSizeBytes: 2048,
    },
  }));
  const service = createKnowledgeBaseService(client);

  await expect(
    service.getUploadConstraints({ knowledgeBaseKey: 'handbook' }),
  ).resolves.toEqual({
    acceptedExtensions: ['.pdf', '.xlsx'],
    maxFileSizeBytes: 2048,
  });
});

test('upload always sends multipart form data containing only the knowledge base key and file', async () => {
  const { calls, client } = uploadClient();
  const service = createKnowledgeBaseService(client);
  const file = new File(['content'], 'guide.txt', { type: 'text/plain' });
  const fetchSpy = vi.spyOn(globalThis, 'fetch');

  await expect(
    service.uploadDocument({ knowledgeBaseKey: 'handbook', file }),
  ).resolves.toEqual(document);

  expect(calls.map(({ resource, action }) => `${resource}:${action}`)).toEqual([
    'ai/aiKnowledgeBaseDocs:getUploadStorage',
    'ai/aiKnowledgeBaseDocs:upload',
  ]);
  const upload = calls[1];
  expect(upload?.options?.query).toEqual({ knowledgeBaseKey: 'handbook' });
  expect(upload?.options?.body).toBeInstanceOf(FormData);
  const form = upload?.options?.body as FormData;
  expect(Array.from(form.keys())).toEqual(['knowledgeBaseKey', 'file']);
  expect(form.get('knowledgeBaseKey')).toBe('handbook');
  expect(form.get('file')).toBe(file);
  expect(calls.some(({ resource }) => resource === 'storages')).toBe(false);
  expect(fetchSpy).not.toHaveBeenCalled();
  fetchSpy.mockRestore();
  expect(service).not.toHaveProperty('getZipFilenameEncodingOptions');
});

test.each(
  SUPPORTED_KNOWLEDGE_BASE_DOCUMENT_EXTENSIONS.flatMap((extension) => [
    extension,
    extension.toUpperCase(),
  ]),
)('accepts the supported document extension %s', async (extension) => {
  const { calls, client } = uploadClient();
  const service = createKnowledgeBaseService(client);
  const file = new File(['content'], `document${extension}`);

  await expect(
    service.uploadDocument({ knowledgeBaseKey: 'handbook', file }),
  ).resolves.toEqual(document);
  expect(calls.filter(({ action }) => action === 'upload')).toHaveLength(1);
});

test.each(['.zip', '.rar', '.7z', '.png', '.exe', ''])(
  'rejects unsupported document extension %s before upload',
  async (extension) => {
    const { calls, client } = uploadClient();
    const service = createKnowledgeBaseService(client);
    const file = new File(['content'], `document${extension}`);

    await expect(
      service.uploadDocument({ knowledgeBaseKey: 'handbook', file }),
    ).rejects.toThrow(`Unsupported file type: ${extension || 'no extension'}.`);
    expect(calls.filter(({ action }) => action === 'upload')).toHaveLength(0);
  },
);

test('rejects a file larger than the advertised limit before upload', async () => {
  const { calls, client } = uploadClient();
  const service = createKnowledgeBaseService(client);
  const file = new File([new Uint8Array(1025)], 'large.pdf');

  await expect(
    service.uploadDocument({ knowledgeBaseKey: 'handbook', file }),
  ).rejects.toThrow('This file exceeds the server upload limit.');
  expect(calls.filter(({ action }) => action === 'upload')).toHaveLength(0);
});

test('requires upload responses to be document records instead of task results', async () => {
  const { client } = uploadClient({ taskId: 42, message: 'queued' });
  const service = createKnowledgeBaseService(client);
  const file = new File(['content'], 'guide.pdf');

  await expect(
    service.uploadDocument({ knowledgeBaseKey: 'handbook', file }),
  ).rejects.toThrow(
    'Knowledge Base API response is missing required field: document.id.',
  );
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
    if (action === 'listLLMServices')
      return {
        data: [{ name: 'embedding-service', title: 'Embedding service' }],
      };
    if (action === 'listModels')
      return { data: [{ id: 'text-embedding-3-small' }] };
    if (action === 'listExternalVectorStoreProviders')
      return { data: ['ExternalProvider'] };
    if (action === 'listStorageDisks')
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
    disk: 'default',
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

  expect(calls[0]).toEqual({
    resource: 'ai/aiKnowledgeBase',
    action: 'create',
    options: {
      method: 'POST',
      unwrap: 'none',
      body: {
        key: 'handbook',
        name: 'Handbook',
        knowledgeBaseType: 'LOCAL',
        enabled: true,
        disk: 'default',
        vectorDatabaseKey: 'vector',
        llmService: 'embedding-service',
        embeddingModel: 'text-embedding-3-small',
      },
    },
  });
  expect(calls[1]).toMatchObject({
    resource: 'ai/aiKnowledgeBase',
    action: 'update',
    options: { query: { filterByTk: 1 }, body: { enabled: false } },
  });
  expect(calls[2]).toMatchObject({
    resource: 'ai/aiKnowledgeBase',
    action: 'destroy',
    options: { query: { 'filterByTk[]': [1] } },
  });
  expect(calls.find((call) => call.action === 'listLLMServices')).toMatchObject(
    {
      resource: 'ai/ai',
      options: { method: 'GET', query: { model: 'EMBEDDING' } },
    },
  );
  expect(calls.find((call) => call.action === 'listModels')).toMatchObject({
    resource: 'ai/ai',
    options: {
      method: 'GET',
      query: { llmService: 'embedding-service', model: 'EMBEDDING' },
    },
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
