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
  const temporal = normalizeTemporalType(dialect, type);
  if (temporal !== undefined) return temporal;

  if (dialect === 'mssql') {
    if (/^(n?varchar)\(max\)$/.test(type)) return 'text';
    if (base === 'bit') return 'boolean';
    if (base === 'uniqueidentifier') return 'uuid';
    if (base === 'timestamp' || base === 'rowversion') return 'blob';
    if (base === 'image') return 'blob';
    if (base === 'ntext') return 'text';
    if (base === 'money' || base === 'smallmoney') return 'decimal';
    if (base === 'float')
      return Number(type.match(/\((\d+)\)/)?.[1] ?? 53) <= 24
        ? 'float'
        : 'double';
  }
  // Oracle FLOAT is a decimal NUMBER subtype, not an IEEE binary float.
  if (dialect === 'oracle' && base === 'float') return 'decimal';
  if (dialect === 'postgres' && base === 'bpchar') return 'char';
  // PostgreSQL catalog "char" is an internal type, not SQL CHAR(n)/bpchar.
  if (dialect === 'postgres' && (type === 'char' || type === '"char"'))
    return 'native';
  if (['char', 'character', 'nchar'].includes(base)) return 'char';

  if (
    /^(smallint|integer|int|int2|int4|mediumint|tinyint)(?:\s+unsigned)?$/.test(
      base,
    )
  ) {
    return 'integer';
  }
  if (/^(bigint|int8)/.test(base)) {
    return 'bigInt';
  }
  if (/^(varchar|varchar2|character varying|nvarchar|nvarchar2)$/.test(base)) {
    return 'string';
  }
  if (
    /^(text|tinytext|mediumtext|longtext|citext|clob|nclob|long)$/.test(base)
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
    ((dialect === 'sqlite' || dialect === 'mysql') && base === 'float') ||
    base === 'real' ||
    base === 'float4' ||
    base === 'binary_float'
  ) {
    return 'float';
  }
  if (/^(double|double precision|float8|binary_double)/.test(base)) {
    return 'double';
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

function normalizeTemporalType(
  dialect: 'sqlite' | 'postgres' | 'mysql' | 'oracle' | 'mssql',
  nativeType: string,
): PhysicalDataType | undefined {
  const type = nativeType
    .replace(/\(\d+\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (type === 'date') return dialect === 'oracle' ? 'datetime' : 'date';
  switch (dialect) {
    case 'postgres':
      if (type === 'timestamptz' || type === 'timestamp with time zone')
        return 'datetimeTz';
      if (type === 'timestamp' || type === 'timestamp without time zone')
        return 'datetime';
      if (type === 'time' || type === 'time without time zone') return 'time';
      break;
    case 'mysql':
      if (type === 'timestamp') return 'datetimeTz';
      if (type === 'datetime') return 'datetime';
      if (type === 'time') return 'time';
      break;
    case 'oracle':
      if (
        type === 'timestamp with time zone' ||
        type === 'timestamp with local time zone'
      )
        return 'datetimeTz';
      if (type === 'timestamp') return 'datetime';
      break;
    case 'mssql':
      if (type === 'datetimeoffset') return 'datetimeTz';
      if (['datetime', 'datetime2', 'smalldatetime'].includes(type))
        return 'datetime';
      if (type === 'time') return 'time';
      break;
    case 'sqlite':
      if (type === 'datetime' || type === 'timestamp') return 'datetime';
      if (type === 'time') return 'time';
      break;
  }
  return undefined;
}

/** Read declared temporal precision without confusing it with numeric scale. */
export function temporalFractionalSecondsPrecision(
  dialect: 'sqlite' | 'postgres' | 'mysql' | 'oracle' | 'mssql',
  nativeType: string,
): number | undefined {
  const type = nativeType.trim().toLowerCase();
  const temporal = normalizeTemporalType(dialect, type);
  const offsetTime =
    dialect === 'postgres' &&
    /^(timetz|time(?:\(\d+\))? with time zone)$/.test(type);
  if (
    !offsetTime &&
    temporal !== 'time' &&
    temporal !== 'datetime' &&
    temporal !== 'datetimeTz'
  )
    return undefined;
  const explicit = type.match(/\((\d+)\)/);
  if (explicit) return Number(explicit[1]);
  if (dialect === 'postgres') return 6;
  if (dialect === 'mysql') return 0;
  if (dialect === 'oracle') return type === 'date' ? 0 : 6;
  if (dialect === 'mssql') {
    if (type === 'smalldatetime') return 0;
    // DATETIME uses 1/300-second ticks, not an exact decimal precision.
    if (type === 'datetime') return undefined;
    return 7;
  }
  // SQLite declarations without precision do not define an effective precision.
  return undefined;
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
