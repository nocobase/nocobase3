import { describe, expect, it } from 'vitest';
import {
  aiSettingsTabs,
  getActiveAISettingsPath,
} from '../client/ai-settings-shell.tsx';
import {
  aiEmployeePath,
  knowledgeBasePath,
  llmServicePath,
  vectorDatabasesPath,
} from '../client/route-paths.ts';

describe('AI settings navigation', () => {
  it('exposes four tabs in the requested order', () => {
    expect(aiSettingsTabs.map(({ label, path }) => ({ label, path }))).toEqual([
      { label: 'AI 员工', path: aiEmployeePath },
      { label: 'LLM 服务', path: llmServicePath },
      { label: '知识库', path: knowledgeBasePath },
      { label: '向量数据库', path: vectorDatabasesPath },
    ]);
  });
  it('activates direct and nested routes', () => {
    expect(getActiveAISettingsPath(llmServicePath)).toBe(llmServicePath);
    expect(getActiveAISettingsPath('/ai/knowledge-base/demo/documents/1')).toBe(
      knowledgeBasePath,
    );
  });
});
