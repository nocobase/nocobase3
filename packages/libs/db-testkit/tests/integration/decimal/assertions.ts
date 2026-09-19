import { expect } from 'vitest';

/** Compare exact decimal text while allowing database-specific trailing zeros. */
export function decimalResult(
  value: string | number | null,
): ReturnType<typeof expect.stringMatching> | null {
  if (value === null) return null;
  const text = String(value);
  const escaped = text.replace('.', '\\.').replace(/^(-?)0\\\./, '$10?\\.');
  return expect.stringMatching(
    new RegExp(`^${escaped}${text.includes('.') ? '0*' : '(?:\\.0+)?'}$`),
  );
}
