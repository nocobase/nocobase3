import { describe, expect, it } from 'vitest';
import {
  normalizeEnabledModels,
  prepareEnabledModels,
} from '../client/llm-service-service.ts';

describe('LLM service client model configuration', () => {
  it('normalizes legacy arrays, historical recommended mode, and invalid structures', () => {
    expect(normalizeEnabledModels([' gpt-4o '])).toEqual({
      mode: 'custom',
      models: [{ label: 'gpt-4o', value: 'gpt-4o' }],
    });
    expect(
      normalizeEnabledModels({
        mode: 'recommended',
        models: [],
      }),
    ).toEqual({ mode: 'provider', models: [] });
    expect(
      normalizeEnabledModels({
        mode: 'invalid',
        models: [{ value: 'ignored' }],
      }),
    ).toEqual({ mode: 'provider', models: [] });
    expect(normalizeEnabledModels(null)).toEqual({
      mode: 'provider',
      models: [],
    });
  });

  it('preserves provider and custom modes', () => {
    for (const mode of ['provider', 'custom'] as const) {
      expect(
        normalizeEnabledModels({
          mode,
          models: [{ label: ' Model ', value: ' model ' }],
        }),
      ).toEqual({
        mode,
        models: [{ label: 'Model', value: 'model' }],
      });
    }
  });

  it('trims, fills labels, and validates custom model IDs before submit', () => {
    expect(
      prepareEnabledModels({
        mode: 'custom',
        models: [{ label: ' ', value: ' model-a ' }],
      }),
    ).toEqual({
      mode: 'custom',
      models: [{ label: 'model-a', value: 'model-a' }],
    });
    expect(() =>
      prepareEnabledModels({
        mode: 'custom',
        models: [{ label: '', value: '' }],
      }),
    ).toThrow('Model ID is required');
    expect(() =>
      prepareEnabledModels({
        mode: 'custom',
        models: [
          { label: '', value: 'same' },
          { label: '', value: ' same ' },
        ],
      }),
    ).toThrow('Duplicate Model ID');
  });
});
