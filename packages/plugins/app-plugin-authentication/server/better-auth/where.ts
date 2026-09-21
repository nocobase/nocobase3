import type {
  ComparisonOperator,
  DatabaseConnection,
  DeleteQuery,
  Expression,
  ExpressionBuilder,
  SelectQuery,
  SqlBool,
  UpdateQuery,
} from '@nocobase/db';
import type { Knex } from 'knex';

import type { UserStoreCondition } from '../user-store.js';

/**
 * Translates Better Auth's linear where list into Database Query API
 * expressions. Shared by the generic adapter and the users plugin's store so
 * both interpret conditions, operators and case-insensitive lookups alike.
 */
export type WhereCondition = UserStoreCondition;

export function conditionExpression(
  eb: ExpressionBuilder,
  condition: WhereCondition,
): Expression<SqlBool> {
  const { field, value, operator } = condition;
  if (value === null) {
    return eb(field, operator === 'ne' ? 'is not' : 'is', null);
  }
  if (operator === 'in' || operator === 'not_in') {
    return eb(
      field,
      operator === 'in' ? 'in' : 'not in',
      Array.isArray(value) ? value : [value],
    );
  }
  if (
    operator === 'contains' ||
    operator === 'starts_with' ||
    operator === 'ends_with'
  ) {
    const pattern =
      operator === 'contains'
        ? `%${String(value)}%`
        : operator === 'starts_with'
          ? `${String(value)}%`
          : `%${String(value)}`;
    return eb(field, 'like', pattern);
  }
  const sqlOperator = {
    eq: '=',
    ne: '<>',
    lt: '<',
    lte: '<=',
    gt: '>',
    gte: '>=',
  }[operator] as ComparisonOperator | undefined;
  if (!sqlOperator) {
    throw new Error(`Unsupported Better Auth operator: ${operator}`);
  }
  return eb(field, sqlOperator, value);
}

export function whereExpression(
  eb: ExpressionBuilder,
  where: readonly WhereCondition[],
): Expression<SqlBool> {
  const branches: Array<Array<Expression<SqlBool>>> = [[]];
  for (const condition of where) {
    if (condition.connector === 'OR' && branches.at(-1)!.length) {
      branches.push([]);
    }
    branches.at(-1)!.push(conditionExpression(eb, condition));
  }
  const expressions = branches
    .filter((branch) => branch.length)
    .map((branch) => (branch.length === 1 ? branch[0] : eb.and(branch)));
  return expressions.length === 1 ? expressions[0] : eb.or(expressions);
}

export function applySelectWhere(
  query: SelectQuery,
  where: readonly WhereCondition[],
): SelectQuery {
  return where.length ? query.where((eb) => whereExpression(eb, where)) : query;
}

export function applyUpdateWhere(
  query: UpdateQuery,
  where: readonly WhereCondition[],
): UpdateQuery {
  return where.length ? query.where((eb) => whereExpression(eb, where)) : query;
}

export function applyDeleteWhere(
  query: DeleteQuery,
  where: readonly WhereCondition[],
): DeleteQuery {
  return where.length ? query.where((eb) => whereExpression(eb, where)) : query;
}

export function equalityCondition(
  field: string,
  value: unknown,
): WhereCondition {
  return {
    field,
    value: value as WhereCondition['value'],
    operator: 'eq',
    connector: 'AND',
    mode: 'sensitive',
  };
}

export async function resolveInsensitiveWhere(
  connection: DatabaseConnection,
  model: string,
  where: readonly WhereCondition[] = [],
): Promise<readonly WhereCondition[]> {
  if (
    !where.some(
      (condition) =>
        condition.mode === 'insensitive' && typeof condition.value === 'string',
    )
  ) {
    return where;
  }
  const knex = await connection.client<Knex>();
  return Promise.all(
    where.map(async (condition) => {
      const { field, value, operator, mode } = condition;
      if (mode !== 'insensitive' || typeof value !== 'string') {
        return condition;
      }

      // Let the Database Query API resolve logical model/field names first. The
      // stable lowercase aliases keep this small raw fallback independent of the
      // configured naming strategy.
      const source = connection.query
        .selectFrom(model)
        .select(['id as authrecordid', `${field} as authcomparevalue`])
        .compile();
      const query = knex
        .from(
          knex.raw(`(${source.sql}) as ??`, [
            ...(source.parameters as readonly Knex.RawBinding[]),
            'authsource',
          ]),
        )
        .select({ id: 'authrecordid' });
      if (
        operator === 'contains' ||
        operator === 'starts_with' ||
        operator === 'ends_with'
      ) {
        const pattern =
          operator === 'contains'
            ? `%${value}%`
            : operator === 'starts_with'
              ? `${value}%`
              : `%${value}`;
        query.whereRaw('lower(??) like lower(?)', [
          'authcomparevalue',
          pattern,
        ]);
      } else {
        const sqlOperator =
          operator === 'eq'
            ? '='
            : operator === 'ne'
              ? '<>'
              : operator === 'lt'
                ? '<'
                : operator === 'lte'
                  ? '<='
                  : operator === 'gt'
                    ? '>'
                    : operator === 'gte'
                      ? '>='
                      : undefined;
        if (!sqlOperator) {
          return condition;
        }
        query.whereRaw(`lower(??) ${sqlOperator} lower(?)`, [
          'authcomparevalue',
          value,
        ]);
      }
      const ids = (await query).map((row: { readonly id: unknown }) => row.id);
      return {
        ...condition,
        field: 'id',
        value: ids.filter((id): id is string => typeof id === 'string'),
        operator: 'in',
        mode: 'sensitive',
      };
    }),
  );
}
