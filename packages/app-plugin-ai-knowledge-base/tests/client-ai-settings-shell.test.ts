import { describe, expect, it } from 'vitest';
import {
  AISettingsShell,
  aiSettingsTabs,
} from '../client/ai-settings-shell.tsx';
import {
  knowledgeBasePath,
  knowledgeBaseWorkspacePath,
  llmServicePath,
} from '../client/route-paths.ts';

describe('AI settings compatibility exports', () => {
  it('re-exports the employee-owned shell and common paths', () => {
    expect(AISettingsShell).toBeTypeOf('function');
    expect(aiSettingsTabs.some((tab) => tab.path === llmServicePath)).toBe(
      true,
    );
    expect(knowledgeBaseWorkspacePath('demo')).toBe(
      `${knowledgeBasePath}/demo`,
    );
  });
});
