import { describe, expect, it } from 'vitest';

import {
  aiSettingsTabs,
  getActiveAISettingsPath,
} from '../client/ai-settings-shell.tsx';
import {
  aiEmployeePath,
  knowledgeBasePath,
  vectorDatabasesPath,
} from '../client/route-paths.ts';

describe('AI settings navigation', () => {
  it('keeps the requested labels and destinations in order', () => {
    expect(aiSettingsTabs.map(({ label, path }) => ({ label, path }))).toEqual([
      { label: 'AI 员工', path: aiEmployeePath },
      { label: '知识库', path: knowledgeBasePath },
      { label: '向量数据库', path: vectorDatabasesPath },
    ]);
  });

  it('keeps nested knowledge base pages under the knowledge base tab', () => {
    expect(getActiveAISettingsPath('/ai/knowledge-base/demo/documents/1')).toBe(
      knowledgeBasePath,
    );
    expect(getActiveAISettingsPath(aiEmployeePath)).toBe(aiEmployeePath);
    expect(getActiveAISettingsPath(vectorDatabasesPath)).toBe(
      vectorDatabasesPath,
    );
  });
});
