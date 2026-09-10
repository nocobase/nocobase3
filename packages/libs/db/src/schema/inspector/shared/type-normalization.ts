import type {
  PhysicalColumnDefault,
  PhysicalDataType,
  PhysicalReferentialAction,
} from '../types.js';
import { optionalString } from './result.js';

export interface PhysicalTypeNormalizationStrategy {
  readonly temporal?: (type: string) => PhysicalDataType | undefined;
  readonly special?: (
    type: string,
    base: string,
  ) => PhysicalDataType | undefined;
  readonly temporalPrecision?: (
    type: string,
    temporal: PhysicalDataType | undefined,
  ) => number | undefined;
  readonly defaultTemporalPrecision?: number;
}

export function normalizePhysicalDataType(
  strategy: PhysicalTypeNormalizationStrategy,
  nativeType: string,
): PhysicalDataType {
  const type = nativeType.trim().toLowerCase();
  const base = type.replace(/\(.*/, '').trim();
  const canonical = type
    .replace(/\(\d+\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const temporal = strategy.temporal?.(canonical);
  if (temporal !== undefined) return temporal;
  const special = strategy.special?.(type, base);
  if (special !== undefined) return special;
  if (['char', 'character', 'nchar'].includes(base)) return 'char';
  if (
    /^(smallint|integer|int|int2|int4|mediumint|tinyint)(?:\s+unsigned)?$/.test(
      base,
    )
  )
    return 'integer';
  if (/^(bigint|int8)/.test(base)) return 'bigInt';
  if (/^(varchar|varchar2|character varying|nvarchar|nvarchar2)$/.test(base))
    return 'string';
  if (/^(text|tinytext|mediumtext|longtext|citext|clob|nclob|long)$/.test(base))
    return 'text';
  if (base === 'boolean' || base === 'bool') return 'boolean';
  if (/^(decimal|numeric|number)/.test(base)) return 'decimal';
  if (base === 'real' || base === 'float4' || base === 'binary_float')
    return 'float';
  if (/^(double|double precision|float8|binary_double)/.test(base))
    return 'double';
  if (/^(json|jsonb)/.test(base)) return 'json';
  if (
    /^(blob|bytea|binary|varbinary|tinyblob|mediumblob|longblob|raw|long raw)/.test(
      base,
    )
  )
    return 'blob';
  if (base === 'uuid') return 'uuid';
  return 'native';
}

export function temporalFractionalSecondsPrecision(
  strategy: PhysicalTypeNormalizationStrategy,
  nativeType: string,
): number | undefined {
  const type = nativeType.trim().toLowerCase();
  const canonical = type
    .replace(/\(\d+\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const temporal = strategy.temporal?.(canonical);
  const precision = strategy.temporalPrecision?.(type, temporal);
  if (precision !== undefined) return precision;
  if (
    temporal === 'time' ||
    temporal === 'datetime' ||
    temporal === 'datetimeTz'
  )
    return strategy.defaultTemporalPrecision;
  return undefined;
}

export function parseColumnDefault(
  expression: unknown,
): PhysicalColumnDefault | undefined {
  if (expression === null || expression === undefined) return undefined;
  const text = optionalString(expression)?.trim();
  if (!text) return undefined;
  const value = parseLiteral(text);
  return value.parsed
    ? { expression: text, value: value.value }
    : { expression: text };
}

export function normalizeReferentialAction(
  action: unknown,
): PhysicalReferentialAction | undefined {
  if (action === null || action === undefined) return undefined;
  switch (optionalString(action)?.trim().toUpperCase().replaceAll('_', ' ')) {
    case 'NO ACTION':
    case 'A':
      return 'noAction';
    case 'RESTRICT':
    case 'R':
      return 'restrict';
    case 'CASCADE':
    case 'C':
      return 'cascade';
    case 'SET NULL':
    case 'N':
      return 'setNull';
    case 'SET DEFAULT':
    case 'D':
      return 'setDefault';
    default:
      return undefined;
  }
}
function parseLiteral(text: string): { parsed: boolean; value?: unknown } {
  const unwrapped = unwrapParentheses(text)
    .replace(/::[\w." ]+$/u, '')
    .trim();
  if (/^null$/i.test(unwrapped)) return { parsed: true, value: null };
  if (/^(true|false)$/i.test(unwrapped))
    return { parsed: true, value: unwrapped.toLowerCase() === 'true' };
  if (/^-?(?:\d+\.?\d*|\.\d+)$/.test(unwrapped))
    return { parsed: true, value: Number(unwrapped) };
  if (
    (unwrapped.startsWith("'") && unwrapped.endsWith("'")) ||
    (unwrapped.startsWith('"') && unwrapped.endsWith('"'))
  ) {
    const quote = unwrapped[0];
    return {
      parsed: true,
      value: unwrapped.slice(1, -1).replaceAll(`${quote}${quote}`, quote),
    };
  }
  return { parsed: false };
}
function unwrapParentheses(value: string): string {
  let result = value;
  while (result.startsWith('(') && result.endsWith(')'))
    result = result.slice(1, -1).trim();
  return result;
}
