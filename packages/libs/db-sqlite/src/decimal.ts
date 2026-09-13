/** Preserve the database's decimal representation without rounding or reformatting. */
export function decimalString(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'bigint')
    return String(value);
  throw new TypeError('Expected a decimal string or numeric value.');
}

/** Decimal text utilities: never round through a JavaScript number. */
export function decimalParts(value: unknown): {
  coefficient: bigint;
  scale: number;
} {
  const match = String(value).match(
    /^([+-]?)(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?$/i,
  );
  if (!match || !(match[2] || match[3]))
    throw new TypeError(`Invalid decimal: ${String(value)}`);
  const exponent = Number(match[4] ?? 0);
  let scale = (match[3]?.length ?? 0) - exponent;
  if (
    !Number.isSafeInteger(scale) ||
    Math.abs(scale) > 1000 ||
    match[2].length + (match[3]?.length ?? 0) > 1000
  )
    throw new RangeError('Decimal exceeds the supported 1000-digit range.');
  let coefficient = BigInt(`${match[1]}${match[2]}${match[3] ?? ''}`);
  if (scale < 0) {
    coefficient *= 10n ** BigInt(-scale);
    scale = 0;
  }
  return { coefficient, scale };
}

export function decimalText(coefficient: bigint, scale: number): string {
  const negative = coefficient < 0n;
  const digits = (negative ? -coefficient : coefficient)
    .toString()
    .padStart(scale + 1, '0');
  const text = scale
    ? `${digits.slice(0, -scale)}.${digits.slice(-scale)}`.replace(/\.?0+$/, '')
    : digits;
  return negative && coefficient !== 0n ? `-${text}` : text;
}

export function normalizeDecimal(value: unknown): string | null {
  if (value == null) return null;
  const { coefficient, scale } = decimalParts(value);
  return decimalText(coefficient, scale);
}

/** A lexicographically sortable key for SQLite's exact decimal aggregates. */
export function decimalSortKey(value: unknown): string | null {
  const text = normalizeDecimal(value);
  if (text === null) return null;
  const { coefficient, scale } = decimalParts(text);
  if (coefficient === 0n) return '1';
  const negative = coefficient < 0n;
  const digits = (negative ? -coefficient : coefficient).toString();
  const magnitude = `${String(digits.length - scale + 2000).padStart(4, '0')}${digits.padEnd(2001, '0')}`;
  return negative
    ? `0${magnitude.replace(/\d/g, (digit) => String(9 - Number(digit)))}`
    : `2${magnitude}`;
}
