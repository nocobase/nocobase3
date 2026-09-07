import { describe, expect, it } from 'vitest';
import {
  normalizePhysicalDataType,
  temporalFractionalSecondsPrecision,
} from '../../../../src/schema/inspector/shared/type-normalization.js';

describe('Temporal physical type classification', () => {
  it.each([
    ['postgres', 'timestamp(3) with time zone', 'datetimeTz', 3],
    ['postgres', 'timestamp without time zone', 'datetime', 6],
    ['postgres', 'timestamptz', 'datetimeTz', 6],
    ['postgres', 'time(4) with time zone', 'native', 4],
    ['postgres', 'timetz', 'native', 6],
    ['postgres', 'time(0) without time zone', 'time', 0],
    ['mysql', 'timestamp(6)', 'datetimeTz', 6],
    ['mysql', 'datetime', 'datetime', 0],
    ['mysql', 'time(3)', 'time', 3],
    ['oracle', 'DATE', 'datetime', 0],
    ['oracle', 'TIMESTAMP(9) WITH TIME ZONE', 'datetimeTz', 9],
    ['oracle', 'TIMESTAMP(6) WITH LOCAL TIME ZONE', 'datetimeTz', 6],
    ['oracle', 'TIMESTAMP', 'datetime', 6],
    ['mssql', 'datetimeoffset(7)', 'datetimeTz', 7],
    ['mssql', 'datetime2(3)', 'datetime', 3],
    ['mssql', 'datetime', 'datetime', undefined],
    ['mssql', 'smalldatetime', 'datetime', 0],
    ['mssql', 'timestamp', 'blob', undefined],
    ['sqlite', 'DATETIME', 'datetime', undefined],
    ['sqlite', 'TIMESTAMP(3)', 'datetime', 3],
    ['sqlite', 'TEXT', 'text', undefined],
    ['mysql', 'year', 'native', undefined],
    ['postgres', 'interval', 'native', undefined],
    ['oracle', 'INTERVAL DAY(2) TO SECOND(6)', 'native', undefined],
    ['postgres', 'timestamp_custom', 'native', undefined],
    ['sqlite', 'time_custom', 'native', undefined],
  ] as const)(
    '%s %s retains its temporal meaning',
    (dialect, nativeType, dataType, precision) => {
      expect(normalizePhysicalDataType(dialect, nativeType)).toBe(dataType);
      expect(temporalFractionalSecondsPrecision(dialect, nativeType)).toBe(
        precision,
      );
    },
  );

  it.each(['sqlite', 'postgres', 'mysql', 'oracle', 'mssql'] as const)(
    'does not confuse numeric precision with temporal precision in %s',
    (dialect) => {
      expect(
        temporalFractionalSecondsPrecision(dialect, 'decimal(18,4)'),
      ).toBeUndefined();
      expect(
        temporalFractionalSecondsPrecision(dialect, 'varchar(64)'),
      ).toBeUndefined();
      expect(normalizePhysicalDataType(dialect, 'date')).toBe(
        dialect === 'oracle' ? 'datetime' : 'date',
      );
    },
  );
});
