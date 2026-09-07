import type { DatabaseDialect } from '../../../database/config.js';
import type { PhysicalColumnSchema } from '../types.js';

type NumericCapabilities = Pick<
  PhysicalColumnSchema,
  'integerBits' | 'binaryPrecision' | 'unsigned'
>;

/** Physical widths only; decimal NUMBER precision must not imply int32/int64. */
export function numericCapabilities(
  dialect: DatabaseDialect,
  nativeType: string,
): NumericCapabilities {
  const type = nativeType.trim().toLowerCase();
  const base = type
    .replace(/\(.*$/, '')
    .replace(/\s+unsigned$/, '')
    .trim();
  if (dialect === 'sqlite') return {};
  if (dialect === 'oracle') {
    if (base === 'binary_float') return { binaryPrecision: 24 };
    if (base === 'binary_double') return { binaryPrecision: 53 };
    if (base === 'float')
      return { binaryPrecision: Number(type.match(/\((\d+)\)/)?.[1] ?? 126) };
    return {};
  }
  const widths: Readonly<Record<string, number>> = {
    tinyint: 8,
    smallint: 16,
    int2: 16,
    mediumint: 24,
    integer: 32,
    int: 32,
    int4: 32,
    bigint: 64,
    int8: 64,
  };
  if (widths[base] !== undefined)
    return {
      integerBits: widths[base],
      unsigned:
        dialect === 'mysql'
          ? /\bunsigned\b/.test(type)
          : dialect === 'mssql' && base === 'tinyint',
    };
  if (dialect === 'mssql' && base === 'float') {
    const precision = Number(type.match(/\((\d+)\)/)?.[1] ?? 53);
    return { binaryPrecision: precision <= 24 ? 24 : 53 };
  }
  if (
    ['real', 'float4'].includes(base) ||
    (dialect === 'mysql' && base === 'float')
  )
    return { binaryPrecision: 24 };
  if (['double', 'double precision', 'float8'].includes(base))
    return { binaryPrecision: 53 };
  return {};
}

/** Follow SQLite's documented affinity ordering, including unusual declarations. */
export function sqliteAffinity(
  declaration: string,
): NonNullable<PhysicalColumnSchema['affinity']> {
  const type = declaration.toUpperCase();
  if (type.includes('INT')) return 'integer';
  if (['CHAR', 'CLOB', 'TEXT'].some((part) => type.includes(part)))
    return 'text';
  if (type === '' || type.includes('BLOB')) return 'blob';
  if (['REAL', 'FLOA', 'DOUB'].some((part) => type.includes(part)))
    return 'real';
  return 'numeric';
}
