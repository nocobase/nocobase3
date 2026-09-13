import { describe, expect, it } from 'vitest';
import type { CollectionDefinition } from '../../../src/collection/types.js';
import { prepareScalarRowDecoder } from '../../../src/repository/internal/row-decoder.js';

const collection: CollectionDefinition = {
  name: 'flags',
  fields: [
    { name: 'enabled', type: 'boolean' },
    { name: 'required', type: 'boolean', nullable: false },
    { name: 'quantity', type: 'integer' },
    { name: 'status', type: 'enum', values: ['draft', 'published'] },
    { name: 'code', type: 'char', length: 3 },
    { name: 'time', type: 'time' },
  ],
};

describe('Prepared scalar row decoding', () => {
  it('reuses synchronous handlers without mutating rows or coercing ordinary numbers', () => {
    const decode = prepareScalarRowDecoder(collection);
    const source = Object.freeze({ enabled: 1, quantity: 1, helper: 'keep' });
    expect(decode(source)).toEqual({
      enabled: true,
      quantity: 1,
      helper: 'keep',
    });
    expect(source.enabled).toBe(1);
    expect(decode({ enabled: '0' })).toEqual({ enabled: false });
    expect(decode({ enabled: null })).toEqual({ enabled: null });
    expect(decode({})).toEqual({});
  });

  it('prepares only selected decoders, preserving helpers for later projection', () => {
    const decode = prepareScalarRowDecoder(collection, ['enabled']);
    expect(decode({ enabled: 1, required: 2 })).toEqual({
      enabled: true,
      required: 2,
    });
    expect(prepareScalarRowDecoder(collection, [])({ enabled: 2 })).toEqual({
      enabled: 2,
    });
  });

  it('preserves existing enum, char and temporal normalization', () => {
    expect(
      prepareScalarRowDecoder(collection)({
        status: 'draft',
        code: ' A ',
        time: '12:30:00',
      }),
    ).toEqual({ status: 'draft', code: ' A ', time: '12:30:00.000' });
  });

  it('preserves read errors and does not poison subsequent rows', () => {
    const decode = prepareScalarRowDecoder(collection);
    for (const row of [{ enabled: 2 }, { required: null }, { status: 'bad' }]) {
      expect(() => decode(row)).toThrow(
        expect.objectContaining({ code: 'INVALID_STORED_VALUE' }),
      );
    }
    expect(() => decode({ time: 'bad' })).toThrow(
      expect.objectContaining({ code: 'FIELD_CAPABILITY_NOT_SUPPORTED' }),
    );
    expect(decode({ enabled: 1 })).toEqual({ enabled: true });
  });

  it('does not retain handlers across changed collection definitions', () => {
    const first = prepareScalarRowDecoder(collection);
    const second = prepareScalarRowDecoder({
      name: 'flags',
      fields: [{ name: 'enabled', type: 'integer' }],
    });
    expect(first({ enabled: 1 })).toEqual({ enabled: true });
    expect(second({ enabled: 1 })).toEqual({ enabled: 1 });
  });
});

describe('Exact integer row decoding', () => {
  const decode = prepareScalarRowDecoder({
    fields: [
      { name: 'large', type: 'bigInt' },
      { name: 'count', type: 'integer' },
      { name: 'sequence', type: 'increments' },
    ],
  });

  it('returns bigInt strings regardless of magnitude and preserves ordinary numbers', () => {
    expect(decode({ large: 0, count: '7', sequence: 1n })).toEqual({
      large: '0',
      count: 7,
      sequence: 1,
    });
    expect(decode({ large: 9007199254740993n })).toEqual({
      large: '9007199254740993',
    });
    expect(decode({ large: '-9007199254740993' })).toEqual({
      large: '-9007199254740993',
    });
    expect(decode({ large: null })).toEqual({ large: null });
  });

  it('rejects already rounded or invalid values instead of fabricating exact strings', () => {
    for (const large of [
      Number.MAX_SAFE_INTEGER + 1,
      1.5,
      '1.5',
      'invalid',
      Infinity,
    ]) {
      expect(() => decode({ large })).toThrow(
        expect.objectContaining({ code: 'INVALID_STORED_VALUE' }),
      );
    }
    expect(() => decode({ count: '9007199254740993' })).toThrow(
      expect.objectContaining({ code: 'INVALID_STORED_VALUE' }),
    );
  });
});
