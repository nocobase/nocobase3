import type { Knex } from 'knex';
import type { FilterConditionNode, FilterLiteral } from '@nocobase/db';

export function compilePostgresJsonCondition(
  client: Knex,
  column: string,
  node: FilterConditionNode,
): Knex.Raw {
  if (node.operator === '$jsonDbNull')
    return client.raw('?? is null', [column]);
  const source = node.jsonPath
    ? client.raw('??::jsonb #> ?::text[]', [column, node.jsonPath.map(String)])
    : client.raw('??::jsonb', [column]);
  const type = client.raw('jsonb_typeof(?)', [source]);
  const jsonNull = client.raw("? = 'null'", [type]);
  if (node.operator === '$jsonNull') return jsonNull;
  if (node.operator === '$jsonAnyNull')
    return client.raw('(?? is null or ?)', [column, jsonNull]);
  if (node.operator === '$jsonEmpty' || node.operator === '$jsonNotEmpty') {
    const length = client.raw(
      "jsonb_array_length(case when ? = 'array' then ? else '[]'::jsonb end)",
      [type, source],
    );
    return client.raw(
      `(? = 'array' and ? ${node.operator === '$jsonEmpty' ? '=' : '>'} 0)`,
      [type, length],
    );
  }
  const equal = (value: FilterLiteral): Knex.Raw =>
    client.raw('? = ?::jsonb', [source, JSON.stringify(value)]);
  if (node.operator === '$jsonEq') return equal(node.value as FilterLiteral);
  if (node.operator === '$jsonNe')
    return client.raw('(? is not null and not (?))', [
      type,
      equal(node.value as FilterLiteral),
    ]);
  const has = (value: FilterLiteral): Knex.Raw =>
    client.raw("(? = 'array' and ? @> ?::jsonb)", [
      type,
      source,
      JSON.stringify([value]),
    ]);
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
