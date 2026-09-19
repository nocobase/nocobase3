/**
 * Serialize a value as JSON whose bytes depend only on its content: object keys
 * are sorted, `undefined` members are dropped, indentation is fixed, and the
 * output ends with one newline. Array order is preserved — the caller decides
 * which arrays are unordered sets and sorts those before serializing.
 */
export function stableJson(value: unknown): string {
  return `${JSON.stringify(normalize(value, []), null, 2)}\n`;
}

function normalize(
  value: unknown,
  path: readonly (string | number)[],
): unknown {
  if (value === null || value === undefined) return value;
  switch (typeof value) {
    case 'string':
    case 'number':
    case 'boolean':
      return value;
    case 'bigint':
      throw new TypeError(
        `Cannot serialize a bigint at ${describePath(path)}; convert it to a string first.`,
      );
    case 'function':
    case 'symbol':
      throw new TypeError(
        `Cannot serialize a ${typeof value} at ${describePath(path)}.`,
      );
    default:
      break;
  }
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    return value.map((item, index) =>
      normalize(item === undefined ? null : item, [...path, index]),
    );
  }
  const record = value as Record<string, unknown>;
  const normalized: Record<string, unknown> = {};
  for (const key of Object.keys(record).sort()) {
    const member = record[key];
    if (member === undefined) continue;
    normalized[key] = normalize(member, [...path, key]);
  }
  return normalized;
}

function describePath(path: readonly (string | number)[]): string {
  return path.length === 0 ? 'the root' : `"${path.join('.')}"`;
}
