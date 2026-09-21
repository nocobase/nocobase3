import type { DatabaseConnection } from '@nocobase/db';
import {
  APIError,
  type BetterAuthOptions,
  type DBAdapterInstance,
} from 'better-auth';
import { createAdapterFactory, type CustomAdapter } from 'better-auth/adapters';

import {
  UserStoreError,
  type UserStore,
  type UserStoreFactory,
} from '../user-store.js';
import {
  applyDeleteWhere,
  applySelectWhere,
  applyUpdateWhere,
  equalityCondition,
  resolveInsensitiveWhere,
  type WhereCondition as CleanWhere,
} from './where.js';

export interface DatabaseAdapterOptions {
  debugLogs?: boolean;
  /**
   * Serves the `user` model. Provided by the users plugin, which owns the
   * table; without it the adapter reads and writes the table directly.
   */
  userStore?: UserStoreFactory;
}

function buildCustomAdapter(
  connection: DatabaseConnection,
  fieldsForModel: (model: string) => string[],
  mapField: (model: string, field: string) => string,
): CustomAdapter {
  return {
    async create({ model, data, select }) {
      await connection.query.insertInto(model).values(data).execute();
      return (await connection.query
        .selectFrom(model)
        .select(select?.length ? select : fieldsForModel(model))
        .where('id', '=', data.id)
        .executeTakeFirst()) as typeof data;
    },
    async findOne({ model, where, select, join }) {
      if (join) {
        throw new Error(
          'Better Auth joins are not enabled by the NocoBase database adapter',
        );
      }
      const normalized = await resolveInsensitiveWhere(
        connection,
        model,
        where,
      );
      return (
        (await applySelectWhere(connection.query.selectFrom(model), normalized)
          .select(select?.length ? select : fieldsForModel(model))
          .executeTakeFirst()) ?? null
      );
    },
    async findMany({ model, where, limit, select, sortBy, offset, join }) {
      if (join) {
        throw new Error(
          'Better Auth joins are not enabled by the NocoBase database adapter',
        );
      }
      const normalized = await resolveInsensitiveWhere(
        connection,
        model,
        where,
      );
      let query = applySelectWhere(
        connection.query.selectFrom(model),
        normalized,
      ).select(select?.length ? select : fieldsForModel(model));
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
      return query.execute();
    },
    async update({ model, where, update }) {
      if (!where.length) {
        return null;
      }
      const normalized = await resolveInsensitiveWhere(
        connection,
        model,
        where,
      );
      const existing = await applySelectWhere(
        connection.query.selectFrom(model),
        normalized,
      )
        .select('id')
        .executeTakeFirst();
      if (!existing) {
        return null;
      }
      await connection.query
        .updateTable(model)
        .set(update as Record<string, unknown>)
        .where('id', '=', existing.id)
        .execute();
      return (
        (await connection.query
          .selectFrom(model)
          .select(fieldsForModel(model))
          .where('id', '=', existing.id)
          .executeTakeFirst()) ?? null
      );
    },
    async updateMany({ model, where, update }) {
      const normalized = await resolveInsensitiveWhere(
        connection,
        model,
        where,
      );
      const result = await applyUpdateWhere(
        connection.query
          .updateTable(model)
          .set(update as Record<string, unknown>),
        normalized,
      ).execute();
      return result.updatedCount ?? 0;
    },
    async delete({ model, where }) {
      if (!where.length) {
        return;
      }
      const normalized = await resolveInsensitiveWhere(
        connection,
        model,
        where,
      );
      await applyDeleteWhere(
        connection.query.deleteFrom(model),
        normalized,
      ).execute();
    },
    async deleteMany({ model, where }) {
      const normalized = await resolveInsensitiveWhere(
        connection,
        model,
        where,
      );
      const result = await applyDeleteWhere(
        connection.query.deleteFrom(model),
        normalized,
      ).execute();
      return result.deletedCount ?? 0;
    },
    async consumeOne<T>({
      model,
      where,
    }: {
      model: string;
      where: CleanWhere[];
    }): Promise<T | null> {
      const normalized = await resolveInsensitiveWhere(
        connection,
        model,
        where,
      );
      while (true) {
        const existing = await applySelectWhere(
          connection.query.selectFrom(model),
          normalized,
        )
          .select(fieldsForModel(model))
          .executeTakeFirst<Record<string, unknown>>();
        if (!existing) {
          return null;
        }
        const result = await applyDeleteWhere(
          connection.query.deleteFrom(model),
          normalized,
        )
          .where('id', '=', existing.id as CleanWhere['value'])
          .execute();
        if (result.deletedCount === 1) {
          return existing as T;
        }
      }
    },
    async incrementOne<T>({
      model,
      where,
      increment,
      set,
    }: {
      model: string;
      where: CleanWhere[];
      increment: Record<string, number>;
      set?: Record<string, unknown>;
    }): Promise<T | null> {
      const normalized = await resolveInsensitiveWhere(
        connection,
        model,
        where,
      );
      while (true) {
        const existing = await applySelectWhere(
          connection.query.selectFrom(model),
          normalized,
        )
          .select(fieldsForModel(model))
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
        ).where('id', '=', existing.id as CleanWhere['value']);
        for (const guard of snapshotGuards) {
          query = query.where(guard.field, '=', guard.value);
        }
        const result = await query.execute();
        if (result.updatedCount === 1) {
          return (await connection.query
            .selectFrom(model)
            .select(fieldsForModel(model))
            .where('id', '=', existing.id as CleanWhere['value'])
            .executeTakeFirst()) as T;
        }
      }
    },
    async count({ model, where }) {
      const normalized = await resolveInsensitiveWhere(
        connection,
        model,
        where,
      );
      const row = await applySelectWhere(
        connection.query.selectFrom(model),
        normalized,
      )
        .select(({ fn }) => [fn.countAll().as('count')])
        .executeTakeFirst<{ count: number | string }>();
      return Number(row?.count ?? 0);
    },
  };
}

export function databaseAdapter(
  connection: DatabaseConnection,
  options: DatabaseAdapterOptions = {},
): DBAdapterInstance {
  let betterAuthOptions: BetterAuthOptions | undefined;
  const factory = (currentConnection: DatabaseConnection): DBAdapterInstance =>
    createAdapterFactory({
      config: {
        adapterId: 'nocobase-database',
        adapterName: 'NocoBase Database',
        debugLogs: options.debugLogs,
        supportsJSON: false,
        supportsDates: true,
        supportsBooleans: true,
        supportsNumericIds: false,
        customTransformOutput: ({ data, fieldAttributes }) =>
          fieldAttributes.type === 'date' && typeof data === 'string'
            ? new Date(data)
            : data,
        transaction: async (callback) => {
          if (!betterAuthOptions) {
            throw new Error('Better Auth adapter is not initialized');
          }
          return currentConnection.transaction(async (transaction) =>
            callback(factory(transaction)(betterAuthOptions!)),
          );
        },
      },
      adapter: ({
        options: initializedOptions,
        schema,
        getDefaultModelName,
        getFieldName,
      }) => {
        betterAuthOptions = initializedOptions;
        const fieldsForModel = (model: string) => {
          const defaultModel = getDefaultModelName(model);
          const fields = new Set([
            'id',
            ...Object.keys(schema[defaultModel]?.fields ?? {}),
          ]);
          return [...fields].map((field) =>
            getFieldName({ model: defaultModel, field }),
          );
        };
        const generic = buildCustomAdapter(
          currentConnection,
          fieldsForModel,
          (model, field) =>
            getFieldName({ model: getDefaultModelName(model), field }),
        );
        const userStore = options.userStore;
        if (!userStore) return generic;
        // The users plugin owns the `user` table: its store applies identity
        // normalization, uniqueness and soft-delete filtering to every user
        // read and write Better Auth performs. Other models stay here.
        const isUser = (model: string): boolean =>
          getDefaultModelName(model) === 'user';
        const stores = new Map<string, UserStore>();
        const users = (model: string): UserStore => {
          let store = stores.get(model);
          if (!store) {
            store = userStore(currentConnection, {
              model,
              fields: fieldsForModel(model),
              field: (name) =>
                name === 'id' || schema.user?.fields[name]
                  ? getFieldName({ model: 'user', field: name })
                  : name,
            });
            stores.set(model, store);
          }
          return store;
        };
        // The store hides soft-deleted users from Better Auth's own
        // pre-checks, so a reserved identity surfaces here as the same API
        // error Better Auth raises for a live duplicate. The original error
        // stays attached for callers that run Better Auth's flows from
        // server code and map it themselves.
        const guarded = async <T>(run: () => Promise<T>): Promise<T> => {
          try {
            return await run();
          } catch (error) {
            if (!(error instanceof UserStoreError)) throw error;
            throw Object.assign(
              error.code === 'USER_NOT_FOUND'
                ? APIError.from('NOT_FOUND', {
                    code: 'USER_NOT_FOUND',
                    message: error.message,
                  })
                : APIError.from('UNPROCESSABLE_ENTITY', {
                    code: 'USER_ALREADY_EXISTS',
                    message: error.message,
                  }),
              { cause: error },
            );
          }
        };
        const routed: CustomAdapter = {
          create: (input) =>
            isUser(input.model)
              ? guarded(() => users(input.model).create(input))
              : generic.create(input),
          findOne: (input) =>
            isUser(input.model) && !input.join
              ? users(input.model).findOne(input)
              : generic.findOne(input),
          findMany: (input) =>
            isUser(input.model) && !input.join
              ? users(input.model).findMany(input)
              : generic.findMany(input),
          count: (input) =>
            isUser(input.model)
              ? users(input.model).count(input)
              : generic.count(input),
          update: (input) =>
            isUser(input.model)
              ? guarded(() => users(input.model).update(input))
              : generic.update(input),
          updateMany: (input) =>
            isUser(input.model)
              ? guarded(() => users(input.model).updateMany(input))
              : generic.updateMany(input),
          delete: (input) =>
            isUser(input.model)
              ? guarded(() => users(input.model).delete(input))
              : generic.delete(input),
          deleteMany: (input) =>
            isUser(input.model)
              ? guarded(() => users(input.model).deleteMany(input))
              : generic.deleteMany(input),
          incrementOne: (input) =>
            isUser(input.model)
              ? users(input.model).incrementOne(input)
              : generic.incrementOne(input),
          consumeOne: (input) => {
            if (isUser(input.model))
              throw new Error('Users cannot be consumed.');
            return generic.consumeOne(input);
          },
        };
        return routed;
      },
    });
  return factory(connection);
}
