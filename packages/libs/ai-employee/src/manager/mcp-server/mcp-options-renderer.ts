import type { MCPOptions } from './types.js';

const stringifyRecord = (value: unknown): Record<string, string> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.entries(value as Record<string, unknown>).reduce<
    Record<string, string>
  >((result, [key, item]) => {
    if (key && item != null) result[key] = String(item);
    return result;
  }, {});
};

const stringifyArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item) => item != null).map((item) => String(item))
    : [];

export const normalizeMCPOptions = (options: MCPOptions): MCPOptions => {
  const normalized: MCPOptions = {
    ...options,
    args: stringifyArray(options.args),
    env: stringifyRecord(options.env),
    headers: stringifyRecord(options.headers),
  };
  if (normalized.transport === 'stdio') {
    normalized.url = undefined;
    normalized.headers = {};
  }
  return normalized;
};
