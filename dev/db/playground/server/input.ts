import { PlaygroundHttpError } from './errors.js';

export function objectInput(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new PlaygroundHttpError(
      400,
      'INVALID_INPUT',
      'Request body must be a JSON object.',
    );
  }
  return input as Record<string, unknown>;
}

export function stringInput(
  input: Record<string, unknown>,
  name: string,
): string {
  const value = input[name];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new PlaygroundHttpError(
      400,
      'INVALID_INPUT',
      `"${name}" must be a non-empty string.`,
    );
  }
  return value.trim();
}

export function optionalStringInput(
  input: Record<string, unknown>,
  name: string,
): string | undefined {
  const value = input[name];
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.trim() === '') {
    throw new PlaygroundHttpError(
      400,
      'INVALID_INPUT',
      `"${name}" must be a non-empty string.`,
    );
  }
  return value.trim();
}

export function numberInput(
  input: Record<string, unknown>,
  name: string,
): number {
  const value = input[name];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new PlaygroundHttpError(
      400,
      'INVALID_INPUT',
      `"${name}" must be a finite number.`,
    );
  }
  return value;
}

export function positiveIntegerInput(
  input: Record<string, unknown>,
  name: string,
): number {
  const value = numberInput(input, name);
  if (!Number.isInteger(value) || value <= 0) {
    throw new PlaygroundHttpError(
      400,
      'INVALID_INPUT',
      `"${name}" must be a positive integer.`,
    );
  }
  return value;
}

export function idInput(value: string): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new PlaygroundHttpError(
      400,
      'INVALID_ID',
      'Resource ID must be a positive integer.',
    );
  }
  return id;
}
