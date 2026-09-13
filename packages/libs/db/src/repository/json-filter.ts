import type { Knex } from 'knex';
import { getDatabaseDriverRuntime } from '../database/runtime.js';
import { RepositoryError } from './errors.js';
import type { FilterConditionNode, FilterOperator } from './types.js';

export const jsonOperators: readonly FilterOperator[] = [
  '$jsonEq',
  '$jsonNe',
  '$jsonHas',
  '$jsonHasSome',
  '$jsonHasEvery',
  '$jsonEmpty',
  '$jsonNotEmpty',
  '$jsonDbNull',
  '$jsonNull',
  '$jsonAnyNull',
];
const noValue: ReadonlySet<string> = new Set([
  '$jsonEmpty',
  '$jsonNotEmpty',
  '$jsonDbNull',
  '$jsonNull',
  '$jsonAnyNull',
]);

export function validateJsonCondition(
  node: FilterConditionNode,
  path: readonly (string | number)[],
): void {
  const fail = (message: string): never => {
    throw new RepositoryError('INVALID_FILTER', message, { path });
  };
  if (!jsonOperators.includes(node.operator))
    fail('Expected a JSON filter operator.');
  if (
    node.jsonPath !== undefined &&
    (!Array.isArray(node.jsonPath) ||
      node.jsonPath.length === 0 ||
      node.jsonPath.some((part) =>
        typeof part === 'number'
          ? !Number.isSafeInteger(part) || part < 0
          : typeof part !== 'string' ||
            part.length === 0 ||
            /["\\]/u.test(part) ||
            part.includes(String.fromCharCode(0)),
      ))
  )
    fail('JSON paths require non-empty keys or non-negative array indexes.');
  if (node.operator === '$jsonDbNull' && node.jsonPath !== undefined)
    fail('Database NULL applies to the whole JSON column only.');
  if (noValue.has(node.operator)) {
    if (node.value !== undefined)
      fail('This JSON operator does not accept a value.');
    return;
  }
  if (!validJson(node.value))
    fail('JSON filters require finite, serializable JSON values.');
  if (node.operator === '$jsonHas' && !scalar(node.value))
    fail('JSON array membership accepts scalar elements only.');
  if (node.operator === '$jsonHasSome' || node.operator === '$jsonHasEvery') {
    if (!Array.isArray(node.value) || !node.value.every(scalar))
      fail('JSON array membership requires a scalar array.');
  }
}

function scalar(value: unknown): boolean {
  return (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  );
}
function validJson(value: unknown, seen: Set<object> = new Set()): boolean {
  if (scalar(value)) return true;
  if (typeof value !== 'object' || value === null || seen.has(value))
    return false;
  if (
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) !== Object.prototype &&
    Object.getPrototypeOf(value) !== null
  )
    return false;
  seen.add(value);
  const valid = Object.values(value).every((item) => validJson(item, seen));
  seen.delete(value);
  return valid;
}

/** JSON equality is structural, with ordered arrays and unordered object keys. */
export function compileJsonCondition(
  client: Knex,
  column: string,
  node: FilterConditionNode,
): Knex.Raw {
  if (node.operator === '$jsonDbNull')
    return client.raw('?? is null', [column]);
  const strategy =
    getDatabaseDriverRuntime(client)?.repository?.compileJsonCondition;
  if (strategy) return strategy({ client, column, node });
  throw new RepositoryError(
    'FIELD_CAPABILITY_NOT_SUPPORTED',
    'JSON filtering is not supported by the configured database driver.',
    { path: ['filter'] },
  );
}
