import type { Knex } from 'knex';
import type { FilterConditionNode, FilterLiteral } from '@nocobase/db';

export function compileSqliteJsonCondition(
  client: Knex,
  column: string,
  node: FilterConditionNode,
): Knex.Raw {
  if (node.operator === '$jsonDbNull')
    return client.raw('?? is null', [column]);
  const path =
    '$' +
    (node.jsonPath ?? [])
      .map((part) =>
        typeof part === 'number' ? `[${part}]` : `.${JSON.stringify(part)}`,
      )
      .join('');
  const source = client.raw('json_extract(??, ?)', [column, path]);
  const type = client.raw('json_type(??, ?)', [column, path]);
  const container = client.raw(
    "case when ? in ('array', 'object') then ? else 'null' end",
    [type, source],
  );
  const jsonNull = client.raw("? = 'null'", [type]);
  if (node.operator === '$jsonNull') return jsonNull;
  if (node.operator === '$jsonAnyNull')
    return client.raw('(?? is null or ?)', [column, jsonNull]);
  if (node.operator === '$jsonEmpty' || node.operator === '$jsonNotEmpty') {
    const length = client.raw('json_array_length(?)', [container]);
    return client.raw(
      `(? = 'array' and ? ${node.operator === '$jsonEmpty' ? '=' : '>'} 0)`,
      [type, length],
    );
  }
  const equal = (value: FilterLiteral): Knex.Raw => {
    const json = JSON.stringify(value);
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
