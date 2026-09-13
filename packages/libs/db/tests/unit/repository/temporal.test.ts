import { describe, expect, it } from 'vitest';
import { normalizeTemporalValue } from '../../../src/repository/temporal.js';

describe('V1 temporal values', () => {
  const localDate = new Date(2026, 8, 6, 9, 30, 0, 120);

  it.each([
    ['date', '2024-02-29', '2024-02-29'],
    ['time', '09:30:00', '09:30:00.000'],
    ['time', '09:30:00.1', '09:30:00.100'],
    ['datetime', '2026-09-06T09:30:00', '2026-09-06T09:30:00.000'],
    ['date', localDate, '2026-09-06'],
    ['time', localDate, '09:30:00.120'],
    ['datetime', localDate, '2026-09-06T09:30:00.120'],
    ['datetimeTz', '2026-09-06T09:30:00+08:00', '2026-09-06T01:30:00.000Z'],
    ['datetimeTz', '2026-09-06T01:30:00Z', '2026-09-06T01:30:00.000Z'],
    [
      'datetimeTz',
      new Date('2026-09-06T01:30:00Z'),
      '2026-09-06T01:30:00.000Z',
    ],
  ])('normalizes %s temporal values', (type, input, expected) => {
    expect(
      normalizeTemporalValue({ name: 'value', type: String(type) }, input),
    ).toBe(expected);
  });

  it.each([
    ['date', '2026-02-29'],
    ['date', '2026-04-31'],
    ['date', '2026-00-01'],
    ['date', '0999-12-31'],
    ['time', '24:00:00'],
    ['time', '23:59:60'],
    ['time', '09:30:00Z'],
    ['time', '-01:00:00'],
    ['time', '09:30:00.0000'],
    ['datetime', '2026-09-06T09:30:00Z'],
    ['date', new Date('invalid')],
    ['time', new Date('invalid')],
    ['datetime', new Date('invalid')],
    ['datetimeTz', '2026-09-06T09:30:00'],
    ['datetimeTz', new Date('invalid')],
    ['datetimeTz', '2026-09-06T09:30:00-00:00'],
    ['datetimeTz', '2026-09-06T09:30:00+14:01'],
    ['datetimeTz', '2026-09-06T09:30:00+01:60'],
    ['datetimeTz', '1000-01-01T00:00:00+01:00'],
    ['datetimeTz', '9999-12-31T23:59:59-01:00'],
  ])(
    'rejects invalid %s values rather than normalizing them silently',
    (type, input) => {
      expect(() =>
        normalizeTemporalValue({ name: 'value', type: String(type) }, input),
      ).toThrow(
        expect.objectContaining({ code: 'INVALID_MUTATION', field: 'value' }),
      );
    },
  );

  it('keeps nullability and caller error paths', () => {
    expect(
      normalizeTemporalValue({ name: 'day', type: 'date' }, null),
    ).toBeNull();
    expect(() =>
      normalizeTemporalValue(
        { name: 'day', type: 'date', nullable: false },
        null,
        'INVALID_FILTER',
        ['filter', 'value'],
      ),
    ).toThrow(
      expect.objectContaining({
        code: 'INVALID_FILTER',
        path: ['filter', 'value'],
      }),
    );
  });
});
