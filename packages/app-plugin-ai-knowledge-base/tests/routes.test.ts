import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const requiredActions = [
  'aiKnowledgeBase:list',
  'aiKnowledgeBase:create',
  'aiKnowledgeBase:update',
  'aiKnowledgeBase:destroy',
  'aiKnowledgeBase:runHitTest',
  'aiKnowledgeBase:confirmVectorStoreChanged',
  'aiKnowledgeBase:checkVectorStoreChanged',
  'aiKnowledgeBase:listExternalVectorStoreProviders',
  'aiKnowledgeBaseDocs:list',
  'aiKnowledgeBaseDocs:get',
  'aiKnowledgeBaseDocs:upload',
  'aiKnowledgeBaseDocs:destroy',
  'aiKnowledgeBaseDocs:vectorization',
  'aiKnowledgeBaseDocs:getUploadStorage',
  'aiKnowledgeBaseDocs:getZipFilenameEncodingOptions',
  'aiKnowledgeBaseDocSegments:list',
  'aiKnowledgeBaseDocSegments:getSegment',
  'aiKnowledgeBaseDocSegments:updateSegment',
  'aiKnowledgeBaseDocSegments:updateQuestions',
  'aiKnowledgeBaseDocSegments:setEnabled',
  'aiKnowledgeBaseDocSegments:deleteSegment',
  'aiKnowledgeBaseDocSegments:regenerate',
  'aiVectorDatabases:list',
  'aiVectorDatabases:get',
  'aiVectorDatabases:create',
  'aiVectorDatabases:update',
  'aiVectorDatabases:destroy',
  'aiVectorDatabases:listProviders',
  'aiVectorDatabases:listEnabled',
  'aiVectorDatabases:testConnection',
  'aiVectorDatabases:findRelatedKnowledgeBase',
];

describe('legacy action contract', () => {
  it('registers every knowledge-base and vector-database action', () => {
    const source = readFileSync(path.resolve('server/routes/index.ts'), 'utf8');
    for (const action of requiredActions)
      expect(source).toContain(`/${action}`);
    expect(source).toContain("app.route('/v2/api', routes)");
    expect(source).toContain("error(context, 401, 'Authentication required')");
    expect(source).toContain(
      "(record) => ({ ...record, accessAbility: 'readWrite' })",
    );
  });
});
