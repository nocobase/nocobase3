import { describe, expect, it } from 'vitest';
import { getActiveAISettingsTabKey } from '../client/ai-settings-shell.tsx';
import { getAISettingsTabs } from '../client/ai-settings.ts';

describe('AI settings navigation', () => {
  it('exposes core tabs in order', () => {
    expect(
      getAISettingsTabs().map(({ key, labelKey }) => ({ key, labelKey })),
    ).toEqual([
      { key: 'ai-employee', labelKey: 'AI Employee' },
      { key: 'llm-service', labelKey: 'LLM Service' },
    ]);
  });

  it('keeps the active tab on the shared settings route', () => {
    expect(getActiveAISettingsTabKey('/settings/ai')).toBe('ai-employee');
    expect(getActiveAISettingsTabKey('/settings/ai', '?tab=llm-service')).toBe(
      'llm-service',
    );
  });
});
