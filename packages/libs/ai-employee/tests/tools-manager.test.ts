import { describe, expect, it } from 'vitest';
import { normalizeToolsEntity } from '../src/manager/tools/default.js';

describe('normalizeToolsEntity auto policy', () => {
  const base = {
    scope: 'GENERAL' as const,
    definition: { name: 'tool', description: 'tool' },
    invoke: async () => undefined,
  };

  it('does not derive auto from defaultPermission', () => {
    const normalized = normalizeToolsEntity({
      ...base,
      defaultPermission: 'ALLOW',
    });

    expect(normalized.defaultPermission).toBe('ALLOW');
    expect(normalized.auto).toBeUndefined();
  });

  it('preserves an explicitly supplied auto value', () => {
    expect(normalizeToolsEntity({ ...base, auto: false }).auto).toBe(false);
  });
});
