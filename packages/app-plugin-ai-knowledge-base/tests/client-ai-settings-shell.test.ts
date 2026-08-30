import { describe, expect, it } from 'vitest';
import {
  AISettingsShell,
  getActiveAISettingsTabKey,
} from '../client/ai-settings-shell.tsx';
import { knowledgeBaseWorkspacePath } from '../client/route-paths.ts';

describe('AI settings compatibility exports', () => {
  it('re-exports the employee-owned shell and keeps detail routes separate', () => {
    expect(AISettingsShell).toBeTypeOf('function');
    expect(getActiveAISettingsTabKey('/settings/ai')).toBe('ai-employee');
    expect(knowledgeBaseWorkspacePath('demo')).toBe(
      '/settings/ai/knowledge-base/demo',
    );
  });
});
