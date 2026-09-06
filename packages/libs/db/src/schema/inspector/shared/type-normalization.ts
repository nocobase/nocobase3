import type {
  PhysicalColumnDefault,
  PhysicalDataType,
  PhysicalReferentialAction,
} from '../types.js';
import { optionalString } from './result.js';

export function normalizePhysicalDataType(
  dialect: 'sqlite' | 'postgres' | 'mysql' | 'oracle' | 'mssql',
  nativeType: string,
): PhysicalDataType {
  const type = nativeType.trim().toLowerCase();
  const base = type.replace(/\(.*/, '').trim();

  if (dialect === 'mssql') {
    if (base === 'bit') return 'boolean';
    if (base === 'uniqueidentifier') return 'uuid';
    if (base === 'timestamp' || base === 'rowversion') return 'blob';
    if (base === 'image') return 'blob';
    if (base === 'ntext') return 'text';
    if (base === 'smalldatetime' || base === 'datetimeoffset') {
      return 'datetime';
    }
    if (base === 'money' || base === 'smallmoney') return 'decimal';
    if (base === 'float') return 'double';
  }

  if (/^(smallint|integer|int|int2|int4|mediumint|tinyint)/.test(base)) {
    return 'integer';
  }
  if (/^(bigint|int8)/.test(base)) {
    return 'bigInt';
  }
  if (
    /^(varchar|varchar2|character varying|character|char|nvarchar|nvarchar2|nchar)/.test(
      base,
    )
  ) {
    return 'string';
  }
  if (
    /^(text|tinytext|mediumtext|longtext|citext|clob|nclob|long)/.test(base)
  ) {
    return 'text';
  }
  if (base === 'boolean' || base === 'bool') {
    return 'boolean';
  }
  if (/^(decimal|numeric|number)/.test(base)) {
    return 'decimal';
  }
  if (
    base === 'float' ||
    base === 'real' ||
    base === 'float4' ||
    base === 'binary_float'
  ) {
    return 'float';
  }
  if (/^(double|double precision|float8|binary_double)/.test(base)) {
    return 'double';
  }
  if (base === 'date' && dialect === 'oracle') {
    return 'datetime';
  }
  if (base === 'date') {
    return 'date';
  }
  if (
    /^(datetime|timestamp|timestamptz|timestamp with|timestamp without)/.test(
      base,
    )
  ) {
    return 'datetime';
  }
  if (/^time/.test(base)) {
    return 'time';
  }
  if (/^(json|jsonb)/.test(base)) {
    return 'json';
  }
  if (
    /^(blob|bytea|binary|varbinary|tinyblob|mediumblob|longblob|raw|long raw)/.test(
      base,
    )
  ) {
    return 'blob';
  }
  if (base === 'uuid') {
    return 'uuid';
  }

  if (dialect === 'sqlite' && type === '') {
    return 'native';
  }
  return 'native';
}

export function parseColumnDefault(
  expression: unknown,
): PhysicalColumnDefault | undefined {
  if (expression === null || expression === undefined) {
    return undefined;
  }
  const text = optionalString(expression)?.trim();
  if (!text) {
    return undefined;
  }
  const value = parseLiteral(text);
  return value.parsed
    ? { expression: text, value: value.value }
    : { expression: text };
}

export function normalizeReferentialAction(
  action: unknown,
): PhysicalReferentialAction | undefined {
  if (action === null || action === undefined) {
    return undefined;
  }
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
  const withoutCasts = unwrapParentheses(text)
    .replace(/::[\w." ]+$/u, '')
    .trim();
  const unwrapped = unwrapParentheses(withoutCasts);
  if (/^null$/i.test(unwrapped)) {
    return { parsed: true, value: null };
  }
  if (/^(true|false)$/i.test(unwrapped)) {
    return { parsed: true, value: unwrapped.toLowerCase() === 'true' };
  }
  if (/^-?(?:\d+\.?\d*|\.\d+)$/.test(unwrapped)) {
    return { parsed: true, value: Number(unwrapped) };
  }
  if (
    (unwrapped.startsWith("'") && unwrapped.endsWith("'")) ||
    (unwrapped.startsWith('"') && unwrapped.endsWith('"'))
  ) {
    const quote = unwrapped[0];
    const inner = unwrapped.slice(1, -1);
    return {
      parsed: true,
      value: inner.replaceAll(`${quote}${quote}`, quote),
    };
  }
  return { parsed: false };
}

function unwrapParentheses(value: string): string {
  let result = value;
  while (result.startsWith('(') && result.endsWith(')')) {
    result = result.slice(1, -1).trim();
  }
  return result;
}
