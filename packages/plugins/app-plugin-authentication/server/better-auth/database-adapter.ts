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
  type UserStoreSource,
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
  userStore?: UserStoreSource;
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
        // The users plugin's store is looked up on the first user operation,
        // never at construction: by then every provider has registered, so
        // the order in which providers resolve authentication cannot bypass
        // the store. Absence is final, because nothing registers later.
        let lookedUp = false;
        let factory: UserStoreFactory | undefined;
        const userStoreFactory = (): UserStoreFactory | undefined => {
          if (!lookedUp) {
            lookedUp = true;
            factory =
              typeof options.userStore === 'function'
                ? options.userStore
                : options.userStore?.resolve();
          }
          return factory;
        };
        // The users plugin owns the `user` table: its store applies identity
        // normalization, uniqueness and soft-delete filtering to every user
        // read and write Better Auth performs. Other models stay here.
        const stores = new Map<string, UserStore>();
        const users = (model: string): UserStore | undefined => {
          const build = userStoreFactory();
          if (!build || getDefaultModelName(model) !== 'user') return undefined;
          let store = stores.get(model);
          if (!store) {
            store = build(currentConnection, {
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
        // error Better Auth raises for a live duplicate; an identity rule
        // violation is a bad request. The original error stays attached for
        // callers that run Better Auth's flows from server code.
        const guarded = async <T>(run: () => Promise<T>): Promise<T> => {
          try {
            return await run();
          } catch (error) {
            if (!(error instanceof UserStoreError)) throw error;
            throw Object.assign(
              error.code === 'INVALID_USER_INPUT'
                ? APIError.from('BAD_REQUEST', {
                    code: 'INVALID_USER_INPUT',
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
          create: (input) => {
            const store = users(input.model);
            return store
              ? guarded(() => store.create(input))
              : generic.create(input);
          },
          findOne: (input) => {
            const store = input.join ? undefined : users(input.model);
            return store ? store.findOne(input) : generic.findOne(input);
          },
          findMany: (input) => {
            const store = input.join ? undefined : users(input.model);
            return store ? store.findMany(input) : generic.findMany(input);
          },
          count: (input) => {
            const store = users(input.model);
            return store ? store.count(input) : generic.count(input);
          },
          update: (input) => {
            const store = users(input.model);
            return store
              ? guarded(() => store.update(input))
              : generic.update(input);
          },
          updateMany: (input) => {
            const store = users(input.model);
            return store
              ? guarded(() => store.updateMany(input))
              : generic.updateMany(input);
          },
          delete: (input) => {
            const store = users(input.model);
            return store
              ? guarded(() => store.delete(input))
              : generic.delete(input);
          },
          deleteMany: (input) => {
            const store = users(input.model);
            return store
              ? guarded(() => store.deleteMany(input))
              : generic.deleteMany(input);
          },
          incrementOne: (input) => {
            const store = users(input.model);
            return store
              ? store.incrementOne(input)
              : generic.incrementOne(input);
          },
          consumeOne: (input) => {
            if (users(input.model))
              throw new Error('Users cannot be consumed.');
            return generic.consumeOne(input);
          },
        };
        return routed;
      },
    });
  return factory(connection);
}
