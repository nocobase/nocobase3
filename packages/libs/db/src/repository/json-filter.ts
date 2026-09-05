import type { Knex } from 'knex';
import { RepositoryError } from './errors.js';
import type {
  FilterConditionNode,
  FilterLiteral,
  FilterOperator,
} from './types.js';

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
  const dialect = String(client.client.config.client);
  const pg =
    dialect === 'pg' || dialect === 'postgres' || dialect === 'postgresql';
  const sqlite = dialect === 'better-sqlite3' || dialect === 'sqlite3';
  const mysql = dialect === 'mysql' || dialect === 'mysql2';
  if (node.operator === '$jsonDbNull')
    return client.raw('?? is null', [column]);
  if (!pg && !sqlite && !mysql)
    throw new RepositoryError(
      'FIELD_CAPABILITY_NOT_SUPPORTED',
      `JSON filtering is not yet supported by the ${dialect} execution adapter.`,
      { path: ['filter'], details: { dialect } },
    );
  const path =
    '$' +
    (node.jsonPath ?? [])
      .map((part) =>
        typeof part === 'number' ? `[${part}]` : `.${JSON.stringify(part)}`,
      )
      .join('');
  const source = pg
    ? node.jsonPath
      ? client.raw('??::jsonb #> ?::text[]', [
          column,
          node.jsonPath.map(String),
        ])
      : client.raw('??::jsonb', [column])
    : client.raw('json_extract(??, ?)', [column, path]);
  const type = pg
    ? client.raw('jsonb_typeof(?)', [source])
    : mysql
      ? client.raw('lower(json_type(?))', [source])
      : client.raw('json_type(??, ?)', [column, path]);
  const container = client.raw(
    "case when ? in ('array', 'object') then ? else 'null' end",
    [type, source],
  );
  const jsonNull = client.raw("? = 'null'", [type]);
  if (node.operator === '$jsonNull') return jsonNull;
  if (node.operator === '$jsonAnyNull')
    return client.raw('(?? is null or ?)', [column, jsonNull]);
  if (node.operator === '$jsonEmpty' || node.operator === '$jsonNotEmpty') {
    const length = pg
      ? client.raw(
          "jsonb_array_length(case when ? = 'array' then ? else '[]'::jsonb end)",
          [type, source],
        )
      : mysql
        ? client.raw('json_length(?)', [source])
        : client.raw('json_array_length(?)', [container]);
    return client.raw(
      `(? = 'array' and ? ${node.operator === '$jsonEmpty' ? '=' : '>'} 0)`,
      [type, length],
    );
  }
  const equal = (value: FilterLiteral): Knex.Raw => {
    const json = JSON.stringify(value);
    if (pg) return client.raw('? = ?::jsonb', [source, json]);
    if (mysql) return client.raw('? = cast(? as json)', [source, json]);
    if (value === null) return jsonNull;
    if (typeof value !== 'object') {
      const expected =
        typeof value === 'boolean'
          ? value
            ? 'true'
            : 'false'
          : typeof value === 'number'
            ? undefined
            : 'text';
      return client.raw(
        `(? ${expected ? '= ?' : "in ('integer', 'real')"} and ? = json_extract(?, '$'))`,
        expected ? [type, expected, source, json] : [type, source, json],
      );
    }
    const left = client.raw(
      "select fullkey, case when type in ('integer', 'real') then 'number' else type end, atom from json_tree(?)",
      [container],
    );
    const right = client.raw(
      "select fullkey, case when type in ('integer', 'real') then 'number' else type end, atom from json_tree(?)",
      [json],
    );
    return client.raw(
      '(? is not null and not exists (? except ?) and not exists (? except ?))',
      [type, left, right, right, left],
    );
  };
  if (node.operator === '$jsonEq') return equal(node.value as FilterLiteral);
  if (node.operator === '$jsonNe')
    return client.raw('(? is not null and not (?))', [
      type,
      equal(node.value as FilterLiteral),
    ]);
  const has = (value: FilterLiteral): Knex.Raw => {
    const json = JSON.stringify(value);
    if (pg)
      return client.raw("(? = 'array' and ? @> ?::jsonb)", [
        type,
        source,
        JSON.stringify([value]),
      ]);
    if (mysql)
      return client.raw("(? = 'array' and json_contains(?, cast(? as json)))", [
        type,
        source,
        JSON.stringify([value]),
      ]);
    const valueType =
      value === null
        ? 'null'
        : typeof value === 'boolean'
          ? String(value)
          : typeof value === 'number'
            ? undefined
            : 'text';
    return client.raw(
      `(? = 'array' and exists (select 1 from json_each(?) as json_element where json_element.type ${valueType ? '= ?' : "in ('integer', 'real')"} and json_element.atom is json_extract(?, '$')))`,
      valueType ? [type, container, valueType, json] : [type, container, json],
    );
  };
  if (node.operator === '$jsonHas') return has(node.value as FilterLiteral);
  const values = node.value as readonly FilterLiteral[];
  const all = node.operator === '$jsonHasEvery';
  if (values.length === 0)
    return client.raw(all ? "? = 'array'" : '1 = 0', all ? [type] : []);
  return client.raw(
    `(${values.map(() => '?').join(all ? ' and ' : ' or ')})`,
    values.map(has),
  );
}
