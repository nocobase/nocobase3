import type { PhysicalColumnSchema } from '../types.js';
export interface NumericCapabilityStrategy {
  readonly ignore?: (base: string) => boolean;
  readonly special?: (
    type: string,
    base: string,
  ) =>
    | Pick<PhysicalColumnSchema, 'integerBits' | 'binaryPrecision' | 'unsigned'>
    | undefined;
  readonly unsigned?: (type: string, base: string) => boolean;
}
type NumericCapabilities = Pick<
  PhysicalColumnSchema,
  'integerBits' | 'binaryPrecision' | 'unsigned'
>;
export function numericCapabilities(
  strategy: NumericCapabilityStrategy,
  nativeType: string,
): NumericCapabilities {
  const type = nativeType.trim().toLowerCase();
  const base = type
    .replace(/\(.*$/, '')
    .replace(/\s+unsigned$/, '')
    .trim();
  if (strategy.ignore?.(base)) return {};
  const special = strategy.special?.(type, base);
  if (special) return special;
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
      unsigned: strategy.unsigned?.(type, base) ?? false,
    };
  if (['real', 'float4'].includes(base)) return { binaryPrecision: 24 };
  if (['double', 'double precision', 'float8'].includes(base))
    return { binaryPrecision: 53 };
  return {};
}
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
