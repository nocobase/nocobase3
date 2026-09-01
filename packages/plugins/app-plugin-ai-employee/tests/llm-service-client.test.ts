import { describe, expect, it } from 'vitest';
import {
  normalizeEnabledModels,
  prepareEnabledModels,
} from '../client/llm-service-service.ts';

describe('LLM service client model configuration', () => {
  it('normalizes legacy arrays and invalid structures', () => {
    expect(normalizeEnabledModels([' gpt-4o '])).toEqual({
      mode: 'custom',
      models: [{ label: 'gpt-4o', value: 'gpt-4o' }],
    });
    expect(
      normalizeEnabledModels({
        mode: 'invalid',
        models: [{ value: 'ignored' }],
      }),
    ).toEqual({ mode: 'recommended', models: [] });
    expect(normalizeEnabledModels(null)).toEqual({
      mode: 'recommended',
      models: [],
    });
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
