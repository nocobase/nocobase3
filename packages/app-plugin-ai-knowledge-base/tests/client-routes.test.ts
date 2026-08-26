import { expect, test } from 'vitest';
import routes from '../client/routes.ts';
import {
  knowledgeBaseDocumentPath,
  knowledgeBasePath,
  knowledgeBaseRetrievalPath,
  knowledgeBaseSegmentPath,
  knowledgeBaseUploadPath,
  knowledgeBaseWorkspacePath,
  vectorDatabasesPath,
} from '../client/route-paths.ts';

test('client exposes seven authenticated knowledge base routes', () => {
  expect(routes.map(({ name, path, auth }) => ({ name, path, auth }))).toEqual([
    { name: 'ai-knowledge-base', path: knowledgeBasePath, auth: 'required' },
    {
      name: 'ai-knowledge-base-vectors',
      path: vectorDatabasesPath,
      auth: 'required',
    },
    {
      name: 'ai-knowledge-base-workspace',
      path: `${knowledgeBasePath}/:knowledgeBaseKey`,
      auth: 'required',
    },
    {
      name: 'ai-knowledge-base-document',
      path: `${knowledgeBasePath}/:knowledgeBaseKey/documents/:documentId`,
      auth: 'required',
    },
    {
      name: 'ai-knowledge-base-segment',
      path: `${knowledgeBasePath}/:knowledgeBaseKey/documents/:documentId/segments/:segmentUid`,
      auth: 'required',
    },
    {
      name: 'ai-knowledge-base-upload',
      path: `${knowledgeBasePath}/:knowledgeBaseKey/upload`,
      auth: 'required',
    },
    {
      name: 'ai-knowledge-base-retrieval',
      path: `${knowledgeBasePath}/:knowledgeBaseKey/retrieval/:resultIndex`,
      auth: 'required',
    },
  ]);
  expect(new Set(routes.map((route) => route.componentLoader)).size).toBe(7);
});

test('route builders encode dynamic identifiers', () => {
  expect(knowledgeBaseWorkspacePath('space/key')).toBe(
    '/ai/knowledge-base/space%2Fkey',
  );
  expect(knowledgeBaseDocumentPath('space/key', 'doc/1')).toContain(
    '/documents/doc%2F1',
  );
  expect(knowledgeBaseSegmentPath('space/key', 'doc/1', 'segment/1')).toContain(
    '/segments/segment%2F1',
  );
  expect(knowledgeBaseUploadPath('space/key')).toBe(
    '/ai/knowledge-base/space%2Fkey/upload',
  );
  expect(knowledgeBaseRetrievalPath('space/key', 2)).toBe(
    '/ai/knowledge-base/space%2Fkey/retrieval/2',
  );
});
