import type {
  ComparisonOperator,
  DatabaseConnection,
  Expression,
  ExpressionBuilder,
  SelectQuery,
  SqlBool,
  UpdateQuery,
} from '@nocobase/db';
import type { Knex } from 'knex';
import type {
  UserStore,
  UserStoreCondition,
  UserStoreModel,
  UserStoreQuery,
} from '@nocobase/app-plugin-authentication';
import {
  assertIdentityAvailable,
  normalizeUserWrite,
  throwIdentityConflict,
  USER_MODEL,
} from './user-record.js';

type CleanWhere = UserStoreCondition;
type UserQuery = UserStoreQuery;

/** Logical user fields whose values are identity or status, never counters. */
const protectedFields = [
  'id',
  'name',
  'username',
  'email',
  'emailVerified',
  'disabledAt',
  'createdAt',
  'updatedAt',
  'image',
  'deletedAt',
  'deletedBy',
] as const;

/** Column naming when the store is used outside Better Auth, such as in tests. */
export const defaultUserStoreModel: UserStoreModel = {
  model: USER_MODEL,
  fields: [...protectedFields],
  field: (name) => name,
};

function conditionExpression(
  eb: ExpressionBuilder,
  condition: CleanWhere,
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

function whereExpression(
  eb: ExpressionBuilder,
  where: readonly CleanWhere[],
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

function applySelectWhere(
  query: SelectQuery,
  where: readonly CleanWhere[],
): SelectQuery {
  return where.length ? query.where((eb) => whereExpression(eb, where)) : query;
}

function applyUpdateWhere(
  query: UpdateQuery,
  where: readonly CleanWhere[],
): UpdateQuery {
  return where.length ? query.where((eb) => whereExpression(eb, where)) : query;
}

function equalityCondition(field: string, value: unknown): CleanWhere {
  return {
    field,
    value: value as CleanWhere['value'],
    operator: 'eq',
    connector: 'AND',
    mode: 'sensitive',
  };
}

async function resolveInsensitiveWhere(
  connection: DatabaseConnection,
  model: string,
  where: readonly CleanWhere[] = [],
): Promise<readonly CleanWhere[]> {
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

/**
 * The users plugin's implementation of the storage contract authentication
 * declares: every read hides soft-deleted users, every write applies the
 * identity rules, and deleting a user is a soft delete.
 */
export function createUserStore(
  connection: DatabaseConnection,
  options: UserStoreModel = defaultUserStoreModel,
): UserStore {
  const model = options.model;
  const field = (name: string): string => options.field(name);
  const fieldsForModel = (): string[] => [...options.fields];
  const mapField = (_model: string, name: string): string => field(name);
  return {
    withConnection: (next) => createUserStore(next, options),
    async create({ data, select }) {
      const normalized = normalizeUserWrite(data, field, true);
      await assertIdentityAvailable(connection, model, field, normalized);
      await connection.query
        .insertInto(model)
        .values(normalized)
        .execute()
        .catch(throwIdentityConflict);
      return (await connection.query
        .selectFrom(model)
        .where(field('deletedAt'), 'is', null)
        .select(select?.length ? [...select] : fieldsForModel())
        .where('id', '=', data.id)
        .executeTakeFirst()) as typeof data;
    },
    async findOne<T>({ where = [], select }: UserQuery) {
      const normalized = await resolveInsensitiveWhere(
        connection,
        model,
        where,
      );
      return (
        (await applySelectWhere(
          connection.query
            .selectFrom(model)
            .where(field('deletedAt'), 'is', null),
          normalized,
        )
          .select(select?.length ? [...select] : fieldsForModel())
          .executeTakeFirst<T>()) ?? null
      );
    },
    async findMany<T>({ where, limit, select, sortBy, offset }: UserQuery) {
      const normalized = await resolveInsensitiveWhere(
        connection,
        model,
        where,
      );
      let query = applySelectWhere(
        connection.query
          .selectFrom(model)
          .where(field('deletedAt'), 'is', null),
        normalized,
      ).select(select?.length ? [...select] : fieldsForModel());
      if (sortBy) {
        query = query.orderBy(mapField(model, sortBy.field), sortBy.direction);
      } else if (offset != null) {
        query = query.orderBy('id');
      }
      if (limit != null) {
        query = query.limit(limit);
      }
      if (offset != null) {
        query = query.offset(offset);
      }
      return query.execute<T>();
    },
    async update<T>({
      where,
      update,
    }: {
      where: readonly CleanWhere[];
      update: T;
    }) {
      if (!where.length) {
        return null;
      }
      const normalized = await resolveInsensitiveWhere(
        connection,
        model,
        where,
      );
      const existing = await applySelectWhere(
        connection.query
          .selectFrom(model)
          .where(field('deletedAt'), 'is', null),
        normalized,
      )
        .select('id')
        .executeTakeFirst();
      if (!existing) {
        return null;
      }
      await this.updateMany({
        where: [equalityCondition('id', existing.id)],
        update: update as Record<string, unknown>,
      });
      return (
        (await connection.query
          .selectFrom(model)
          .where(field('deletedAt'), 'is', null)
          .select(fieldsForModel())
          .where('id', '=', existing.id)
          .executeTakeFirst<T>()) ?? null
      );
    },
    async updateMany({ where, update }) {
      const normalized = await resolveInsensitiveWhere(
        connection,
        model,
        where,
      );
      const rows = await applySelectWhere(
        connection.query
          .selectFrom(model)
          .where(field('deletedAt'), 'is', null),
        normalized,
      )
        .select('id')
        .orderBy('id')
        .execute<{ id: unknown }>();
      const patch = normalizeUserWrite(update, field, false);
      let updated = 0;
      for (const row of rows) {
        const id = String(row.id);
        await assertIdentityAvailable(connection, model, field, patch, id);
        const result = await connection.query
          .updateTable(model)
          .set(patch)
          .where('id', '=', id)
          .where(field('deletedAt'), 'is', null)
          .execute()
          .catch(throwIdentityConflict);
        updated += result.updatedCount ?? 0;
      }
      return updated;
    },
    async delete({ where }) {
      if (where.length) await this.deleteMany({ where });
    },
    // Deleting a user is a soft delete: the identity stays reserved and the
    // record keeps its history; every read above already hides it.
    async deleteMany({ where }) {
      return this.updateMany({
        where,
        update: {
          [field('deletedAt')]: new Date(),
          [field('disabledAt')]: new Date(),
        },
      });
    },
    async incrementOne<T>({
      where,
      increment,
      set,
    }: {
      where: readonly CleanWhere[];
      increment: Record<string, number>;
      set?: Record<string, unknown>;
    }): Promise<T | null> {
      for (const name of [
        ...Object.keys(increment),
        ...Object.keys(set ?? {}),
      ]) {
        if (protectedFields.some((key) => field(key) === name))
          throw new TypeError(
            'User identity and status fields cannot be incremented.',
          );
      }
      const normalized = await resolveInsensitiveWhere(
        connection,
        model,
        where,
      );
      // Counters may live outside the registered user fields; read them too.
      const columns = [
        ...new Set([...fieldsForModel(), ...Object.keys(increment)]),
      ];
      while (true) {
        const existing = await applySelectWhere(
          connection.query
            .selectFrom(model)
            .where(field('deletedAt'), 'is', null),
          normalized,
        )
          .select(columns)
          .executeTakeFirst<Record<string, unknown>>();
        if (!existing) {
          return null;
        }
        const update = { ...set };
        const snapshotGuards: CleanWhere[] = [];
        for (const [field, delta] of Object.entries(increment)) {
          const current = existing[field];
          update[field] = Number(current) + delta;
          snapshotGuards.push(equalityCondition(field, current));
        }
        let query = applyUpdateWhere(
          connection.query.updateTable(model).set(update),
          normalized,
        )
          .where('id', '=', existing.id as CleanWhere['value'])
          .where(field('deletedAt'), 'is', null);
        for (const guard of snapshotGuards) {
          query = query.where(guard.field, '=', guard.value);
        }
        const result = await query.execute();
        if (result.updatedCount === 1) {
          return (await connection.query
            .selectFrom(model)
            .where(field('deletedAt'), 'is', null)
            .select(columns)
            .where('id', '=', existing.id as CleanWhere['value'])
            .executeTakeFirst()) as T;
        }
      }
    },
    async count({ where }) {
      const normalized = await resolveInsensitiveWhere(
        connection,
        model,
        where,
      );
      const row = await applySelectWhere(
        connection.query
          .selectFrom(model)
          .where(field('deletedAt'), 'is', null),
        normalized,
      )
        .select(({ fn }) => [fn.countAll().as('count')])
        .executeTakeFirst<{ count: number | string }>();
      return Number(row?.count ?? 0);
    },
  };
}
