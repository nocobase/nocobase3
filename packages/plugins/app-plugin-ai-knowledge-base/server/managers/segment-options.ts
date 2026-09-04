import type { SegmentOptions } from '../internal-types.js';

export function normalizeSegmentOptions(value: unknown): SegmentOptions {
  const input =
    value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : {};
  const chunkSize = Math.min(
    100_000,
    Math.max(1, Number(input.chunkSize) || 6000),
  );
  const chunkOverlap = Math.min(
    chunkSize - 1,
    Math.max(0, Number(input.chunkOverlap) || 1200),
  );
  return { enabled: input.enabled !== false, chunkSize, chunkOverlap };
}
