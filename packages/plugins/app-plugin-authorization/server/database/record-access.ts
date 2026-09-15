import type { Principal } from '@nocobase/authorization/core';
import type { OptionText } from '../i18n.js';
import type { AuthorizationCollection } from './model.js';
import { condition, type DatabaseScope } from './scope.js';

export interface RecordAccessPolicyContext<P> {
  principal: Principal;
  collection: AuthorizationCollection;
  action: string;
  params: P;
}

export interface RecordAccessPolicy<P = unknown> {
  key: string;
  title?: OptionText;
  description?: OptionText;
  paramsSchema?: unknown;
  resolve(
    context: RecordAccessPolicyContext<P>,
  ): DatabaseScope | Promise<DatabaseScope>;
}

export interface DefineRecordAccessPolicyOptions<P = unknown> {
  key: string;
  title?: OptionText;
  description?: OptionText;
  paramsSchema?: unknown;
  resolve: RecordAccessPolicy<P>['resolve'];
}

export function defineRecordAccessPolicy<P = unknown>(
  options: DefineRecordAccessPolicyOptions<P>,
): RecordAccessPolicy<P> {
  return { ...options };
}

export function allRecords(): RecordAccessPolicy {
  return defineRecordAccessPolicy({
    key: 'allRecords',
    title: { key: 'options.recordAccessPolicies.allRecords' },
    resolve: () => true,
  });
}

/** Which column carries the principal. The default suits most Collections. */
export interface RecordOwnerParams {
  field?: string;
}

export function recordsIOwn(): RecordAccessPolicy<
  RecordOwnerParams | undefined
> {
  return defineRecordAccessPolicy<RecordOwnerParams | undefined>({
    key: 'recordsIOwn',
    title: { key: 'options.recordAccessPolicies.recordsIOwn' },
    resolve: ({ principal, collection, params }) =>
      condition(
        ownerField(collection, params?.field ?? 'ownerId'),
        '$eq',
        principal.id,
      ),
  });
}

export function recordsICreated(): RecordAccessPolicy<
  RecordOwnerParams | undefined
> {
  return defineRecordAccessPolicy<RecordOwnerParams | undefined>({
    key: 'recordsICreated',
    title: { key: 'options.recordAccessPolicies.recordsICreated' },
    resolve: ({ principal, collection, params }) =>
      condition(
        ownerField(collection, params?.field ?? 'createdById'),
        '$eq',
        principal.id,
      ),
  });
}

export interface CustomFilterParams {
  filter: DatabaseScope;
}

export function customFilter(): RecordAccessPolicy<CustomFilterParams> {
  return defineRecordAccessPolicy({
    key: 'customFilter',
    title: { key: 'options.recordAccessPolicies.customFilter' },
    description: { key: 'options.recordAccessPolicies.customFilterHint' },
    paramsSchema: { type: 'filter-node' },
    resolve: ({ params }) => {
      if (!params || typeof params !== 'object' || !('filter' in params)) {
        throw new Error('Custom Filter requires filter params');
      }
      return params.filter;
    },
  });
}

function ownerField(
  collection: AuthorizationCollection,
  field: string,
): string {
  if (!collection.fields.includes(field)) {
    throw new Error(
      `Collection "${collection.name}" has no field "${field}" to own records by`,
    );
  }
  return field;
}
