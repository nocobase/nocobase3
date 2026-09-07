import type {
  AuthorizationScope,
  DatabaseAuthorizationParams,
  DatabaseAuthorizationConditions,
  DatabaseFilter,
  DatabaseFilterOperator,
} from '@nocobase/app-plugin-authorization';
import type {
  ComparisonOperator,
  DatabaseConnection,
  Expression,
  ExpressionBuilder,
  SqlBool,
} from '@nocobase/db';
import type { ResourceRef } from './contracts.js';
import type { AuditResourceAdapter } from './authorization.js';
import { AuditAccessDenied } from './authorization.js';

const operators: Record<DatabaseFilterOperator, ComparisonOperator> = {
  $eq: '=',
  $ne: '!=',
  $in: 'in',
  $notIn: 'not in',
  $gt: '>',
  $gte: '>=',
  $lt: '<',
  $lte: '<=',
};
function compile(
  eb: ExpressionBuilder,
  filter: DatabaseFilter,
): Expression<SqlBool> {
  return eb.and(
    Object.entries(filter).map(([field, value]) => {
      if (field === '$and' || field === '$or') {
        if (!Array.isArray(value)) throw new AuditAccessDenied();
        const nested = value.map((entry: DatabaseFilter) => compile(eb, entry));
        return field === '$and' ? eb.and(nested) : eb.or(nested);
      }
      if (!value || Array.isArray(value)) throw new AuditAccessDenied();
      return eb.and(
        Object.entries(value).map(([operator, expected]) => {
          const comparison = operators[operator as DatabaseFilterOperator];
          if (!comparison) throw new AuditAccessDenied();
          return eb(field, comparison, expected);
        }),
      );
    }),
  );
}
export interface AuditDatabaseResourceOptions {
  readonly connection: DatabaseConnection;
  readonly resource: string;
  /** Explicit physical mapping supplied by the resource owner. */
  readonly table: string;
  readonly keyFields: readonly string[];
  /** Owner-supplied tenant predicate, also used for existence checks. */
  readonly boundaryFilter: DatabaseFilter;
}
export function createAuditDatabaseResourceAdapter(
  options: AuditDatabaseResourceOptions,
): AuditResourceAdapter {
  if (
    !options.keyFields.length ||
    new Set(options.keyFields).size !== options.keyFields.length
  )
    throw new AuditAccessDenied();
  return {
    dataSource: options.connection.name,
    resource: options.resource,
    async canRead(
      authorization: AuthorizationScope,
      target: ResourceRef,
    ): Promise<'allowed' | 'denied' | 'deleted'> {
      if (
        target.dataSource !== options.connection.name ||
        target.resource !== options.resource ||
        target.key === undefined
      )
        return 'denied';
      const key =
        typeof target.key === 'string' && options.keyFields.length === 1
          ? { [options.keyFields[0]]: target.key }
          : target.key;
      if (
        typeof key !== 'object' ||
        Object.keys(key).length !== options.keyFields.length ||
        options.keyFields.some((field) => !(field in key))
      )
        return 'denied';
      const decision =
        await authorization.authorize<DatabaseAuthorizationParams>({
          resource: {
            type: 'database.collection',
            id: options.connection.name + '.' + options.resource,
          },
          action: 'read',
          params: { fields: { output: options.keyFields } },
        });
      if (
        decision.effect !== 'conditional' ||
        decision.conditions?.type !== 'database'
      )
        return 'denied';
      const conditions = decision.conditions as DatabaseAuthorizationConditions;
      const filter: DatabaseFilter = {
        $and: Object.entries(key).map(([field, value]) => ({
          [field]: { $eq: value },
        })),
      };
      const query = () =>
        options.connection.query
          .selectFrom(options.table)
          .select([...options.keyFields])
          .where((eb) =>
            compile(eb, { $and: [options.boundaryFilter, filter] }),
          )
          .limit(1);
      const allowed = await query()
        .where((eb) => compile(eb, conditions.filter))
        .execute();
      if (allowed.length) return 'allowed';
      return (await query().execute()).length ? 'denied' : 'deleted';
    },
  };
}
