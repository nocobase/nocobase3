import type { Principal } from '@nocobase/authorization/core';
import { condition, type DatabaseScope } from './scope.js';

import { type RecordAccessPolicy } from '@nocobase/authorization/core';

export function allRecords(): RecordAccessPolicy {
  return databaseRecordAccess({
    key: 'allRecords',
    title: { key: 'options.recordAccessPolicies.allRecords' },
    resolve: () => true,
  });
}

/** Which column carries the principal. The default suits most Collections. */
export interface RecordOwnerParams {
  field?: string;
}

export class UserContextRequiredError extends Error {
  constructor() {
    super('This record scope requires a user principal.');
  }
}

function userId(principal: Principal): string {
  if (principal.type !== 'user') throw new UserContextRequiredError();
  return principal.id;
}

export function recordsIOwn(): RecordAccessPolicy<
  RecordOwnerParams | undefined
> {
  return databaseRecordAccess<RecordOwnerParams | undefined>({
    key: 'recordsIOwn',
    requiredFields: ['ownerId'],
    title: { key: 'options.recordAccessPolicies.recordsIOwn' },
    resolve: ({ principal, params }) =>
      condition(params?.field ?? 'ownerId', '$eq', userId(principal)),
  });
}

export function recordsICreated(): RecordAccessPolicy<
  RecordOwnerParams | undefined
> {
  return databaseRecordAccess<RecordOwnerParams | undefined>({
    key: 'recordsICreated',
    requiredFields: ['createdById'],
    title: { key: 'options.recordAccessPolicies.recordsICreated' },
    resolve: ({ principal, params }) =>
      condition(params?.field ?? 'createdById', '$eq', userId(principal)),
  });
}

export interface CustomFilterParams {
  filter: DatabaseScope;
}

export function customFilter(): RecordAccessPolicy<CustomFilterParams> {
  return databaseRecordAccess({
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

/** DB-specific applicability metadata, interpreted only by the DB adapter. */
export interface DatabaseRecordAccessPolicy<
  P = unknown,
> extends RecordAccessPolicy<P> {
  requiredFields?: readonly string[];
}
function databaseRecordAccess<P = unknown>(
  definition: Omit<DatabaseRecordAccessPolicy<P>, 'resources'>,
): DatabaseRecordAccessPolicy<P> {
  return {
    ...definition,
    resources: [{ type: 'database.collection', id: '*' }],
  };
}
export function databaseRecordAccessApplicable(
  policy: RecordAccessPolicy,
  fields: readonly string[],
): boolean {
  const required: unknown = Reflect.get(policy, 'requiredFields');
  return (
    required === undefined ||
    (Array.isArray(required) &&
      required.every(
        (field: unknown) => typeof field === 'string' && fields.includes(field),
      ))
  );
}
