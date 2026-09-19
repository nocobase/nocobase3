import type { CustomerInput, CustomerUpdate, CustomerDelete } from './types.js';

export class CustomerInputError extends Error {
  public constructor() {
    super('Invalid customer input.');
  }
}
function object(
  value: unknown,
  allowed: readonly string[],
): Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !allowed.includes(key))
  )
    throw new CustomerInputError();
  return value as Record<string, unknown>;
}
export function parseCustomerInput(value: unknown): CustomerInput {
  const input = object(value, ['name', 'phone']);
  if (
    typeof input.name !== 'string' ||
    !input.name.trim() ||
    input.name.length > 120 ||
    typeof input.phone !== 'string' ||
    !/^1\d{10}$/.test(input.phone)
  )
    throw new CustomerInputError();
  return { name: input.name.trim(), phone: input.phone };
}
export function parseCustomerDelete(value: unknown): CustomerDelete {
  const input = object(value, ['id', 'version']);
  if (
    typeof input.id !== 'string' ||
    !input.id ||
    input.id.length > 64 ||
    !Number.isSafeInteger(input.version) ||
    Number(input.version) < 0
  )
    throw new CustomerInputError();
  return { id: input.id, version: Number(input.version) };
}
export function parseCustomerUpdate(value: unknown): CustomerUpdate {
  const input = object(value, ['id', 'version', 'name', 'phone']);
  return {
    ...parseCustomerDelete({ id: input.id, version: input.version }),
    ...parseCustomerInput({ name: input.name, phone: input.phone }),
  };
}
