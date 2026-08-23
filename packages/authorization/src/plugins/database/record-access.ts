import type { Principal } from '../../core/index.js';
import type { DatabaseCollectionDefinition } from './model.js';
import { allRecordsFilter, type DatabaseFilter } from './filter.js';

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
  ): DatabaseFilter | Promise<DatabaseFilter>;
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
    resolve: () => allRecordsFilter(),
  });
}

export function recordsIOwn(): RecordAccessPolicy {
  return defineRecordAccessPolicy({
    key: 'recordsIOwn',
    title: 'Records I Own',
    resolve: ({ principal, collection }) => ({
      $and: [
        {
          [requiredAttribute(collection, 'owner')]: { $eq: principal.id },
        },
      ],
    }),
  });
}

export function recordsICreated(): RecordAccessPolicy {
  return defineRecordAccessPolicy({
    key: 'recordsICreated',
    title: 'Records I Created',
    resolve: ({ principal, collection }) => ({
      $and: [
        {
          [requiredAttribute(collection, 'creator')]: { $eq: principal.id },
        },
      ],
    }),
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
