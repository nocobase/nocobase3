import { describe, expect, it } from 'vitest';
import {
  validateEnumMembers,
  validateEnumDefinition,
} from '../../../src/collection/enum.js';
import { normalizeEnumValue } from '../../../src/repository/enum.js';
import { normalizeCharValue } from '../../../src/repository/char.js';
import { validateCollectionMetadataDocument } from '../../../src/metadata/validation.js';
import { CollectionMetadataService } from '../../../src/metadata/service.js';
import { InMemoryCollectionMetadataStore } from '../../../src/metadata/in-memory-document-store.js';

describe('Enum domain validation and lifecycle', () => {
  it('validates exact members without case folding or trimming', () => {
    const values = ['x', 'X', 'x ', '中文', '😀'];
    expect(() => validateEnumMembers(values)).not.toThrow();
    const field = { name: 'state', type: 'enum', values };
    expect(normalizeEnumValue(field, 'x ')).toBe('x ');
    expect(() => normalizeEnumValue(field, 'invalid')).toThrow(
      expect.objectContaining({ code: 'INVALID_MUTATION' }),
    );
    expect(() =>
      normalizeEnumValue(field, 'invalid', 'INVALID_STORED_VALUE'),
    ).toThrow(expect.objectContaining({ code: 'INVALID_STORED_VALUE' }));
    expect(() => validateEnumDefinition({ ...field, length: 1 })).toThrow();
    expect(() =>
      validateEnumDefinition({ ...field, defaultValue: 'invalid' }),
    ).toThrow();
  });
  it('rejects missing, malformed, oversized and misplaced member metadata', () => {
    for (const values of [
      undefined,
      null,
      [],
      [1],
      ['a', 'a'],
      new Array(257).fill('a'),
      new Array(1),
      ['a'.repeat(256)],
      ['\ud800'],
    ]) {
      expect(() =>
        validateCollectionMetadataDocument({
          version: 1,
          name: 'items',
          fields: { state: { type: 'enum', values } },
        }),
      ).toThrow();
    }
    expect(() =>
      validateCollectionMetadataDocument({
        version: 1,
        name: 'items',
        fields: { state: { type: 'string', values: ['a'] } },
      }),
    ).toThrow();
  });
  it('guards member removal even with a custom metadata validator', async () => {
    const service = new CollectionMetadataService({
      store: new InMemoryCollectionMetadataStore(),
      validator: { validate: async () => {} },
      invalidator: { invalidate: () => {}, invalidateAll: () => {} },
      onInvalidationError: (error) => {
        throw error;
      },
    });
    await service.updateField('items', 'state', {
      type: 'enum',
      values: ['a', 'b'],
    });
    await service.updateField('items', 'state', { title: 'State' });
    await service.updateField('items', 'state', { values: ['b', 'a', 'c'] });
    await expect(
      service.updateField('items', 'state', { values: ['a'] }),
    ).rejects.toThrow('Removing or renaming');
    await expect(
      service.replaceDocument({
        version: 1,
        name: 'items',
        fields: { state: { type: 'enum', values: ['a'] } },
      }),
    ).rejects.toThrow('Removing or renaming');
    await service.updateField('items', 'state', { type: 'string' });
    expect(
      (await service.get('items'))?.document.fields?.state?.values,
    ).toBeUndefined();
  });
});

describe('CHAR native length contract', () => {
  it('preserves spaces and distinguishes character counts from UTF-16 units', () => {
    expect(
      normalizeCharValue({ name: 'code', type: 'char', length: 2 }, 'a '),
    ).toBe('a ');
    expect(
      normalizeCharValue({ name: 'code', type: 'char', length: 1 }, '😀'),
    ).toBe('😀');
    expect(() =>
      normalizeCharValue(
        {
          name: 'code',
          type: 'char',
          length: 1,
          db: { lengthUnit: 'utf16CodeUnits' },
        },
        '😀',
      ),
    ).toThrow();
  });
});
