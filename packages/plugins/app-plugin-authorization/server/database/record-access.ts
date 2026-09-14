import type { Principal } from '@nocobase/authorization/core';
import type { DatabaseCollectionDefinition } from './model.js';
import { condition, type DatabaseScope } from './scope.js';

export interface RecordAccessPolicyContext<P> {
  principal: Principal;
  collection: DatabaseCollectionDefinition;
  action: string;
  params: P;
}

export interface RecordAccessPolicy<P = unknown> {
  key: string;
  title?: string;
  description?: string;
  paramsSchema?: unknown;
  resolve(
    context: RecordAccessPolicyContext<P>,
  ): DatabaseScope | Promise<DatabaseScope>;
}

export interface DefineRecordAccessPolicyOptions<P = unknown> {
  key: string;
  title?: string;
  description?: string;
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
    title: 'All Records',
    resolve: () => true,
  });
}

export function recordsIOwn(): RecordAccessPolicy {
  return defineRecordAccessPolicy({
    key: 'recordsIOwn',
    title: 'Records I Own',
    resolve: ({ principal, collection }) =>
      condition(requiredAttribute(collection, 'owner'), '$eq', principal.id),
  });
}

export function recordsICreated(): RecordAccessPolicy {
  return defineRecordAccessPolicy({
    key: 'recordsICreated',
    title: 'Records I Created',
    resolve: ({ principal, collection }) =>
      condition(requiredAttribute(collection, 'creator'), '$eq', principal.id),
  });
}

export interface CustomFilterParams {
  filter: DatabaseScope;
}

export function customFilter(): RecordAccessPolicy<CustomFilterParams> {
  return defineRecordAccessPolicy({
    key: 'customFilter',
    title: 'Custom Filter',
    description: 'Select records with a custom filter condition.',
    paramsSchema: { type: 'filter-node' },
    resolve: ({ params }) => {
      if (!params || typeof params !== 'object' || !('filter' in params)) {
        throw new Error('Custom Filter requires filter params');
      }
      return params.filter;
    },
  });
}

function requiredAttribute(
  collection: DatabaseCollectionDefinition,
  attribute: string,
): string {
  const field = collection.attributes?.[attribute];
  if (!field) {
    throw new Error(
      `Collection "${collection.name}" does not declare the "${attribute}" attribute`,
    );
  }
  return field;
}
