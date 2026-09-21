import type { DatabaseConnection } from '@nocobase/db';
import {
  applySelectWhere,
  applyUpdateWhere,
  equalityCondition,
  resolveInsensitiveWhere,
  type UserStore,
  type UserStoreCondition,
  type UserStoreModel,
  type UserStoreQuery,
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
      // The row was live when matched; return it even when this very update
      // soft-deleted it, so Better Auth's update flow sees the record it wrote.
      return (
        (await connection.query
          .selectFrom(model)
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
      const patch = normalizeUserWrite(update, field, false);
      const changesIdentity = ['email', 'username'].some(
        (name) => patch[field(name)] != null,
      );
      if (!changesIdentity) {
        // Status and profile changes apply as one statement.
        const result = await applyUpdateWhere(
          connection.query.updateTable(model).set(patch),
          normalized,
        )
          .where(field('deletedAt'), 'is', null)
          .execute();
        return result.updatedCount ?? 0;
      }
      // An identity change is checked per row against every other user.
      const rows = await applySelectWhere(
        connection.query
          .selectFrom(model)
          .where(field('deletedAt'), 'is', null),
        normalized,
      )
        .select('id')
        .orderBy('id')
        .execute<{ id: unknown }>();
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
