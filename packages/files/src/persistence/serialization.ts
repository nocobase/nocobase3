import type { JsonObject } from "../contracts/index.ts";

export function encodeJson(value: JsonObject | undefined): string | null {
  return value === undefined ? null : JSON.stringify(value);
}

export function decodeJson(value: string | null | undefined): JsonObject | undefined {
  if (value == null) return undefined;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
    return parsed as JsonObject;
  } catch {
    throw new Error("Invalid persisted JSON");
  }
}

export function toDate(value: Date | string): Date {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("Invalid persisted timestamp");
  return date;
}

export function toSafeNumber(value: number | string | bigint): number {
  const n = typeof value === "bigint" ? Number(value) : Number(value);
  if (!Number.isSafeInteger(n) || n < 0) throw new Error("Persisted size exceeds safe integer range");
  return n;
}
