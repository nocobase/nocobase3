import type { DatabaseManager } from '@nocobase/app-database';

import { FileRouteError, invalidFileRoute } from './route-errors.js';

export type FileRouteSchemaValidation = Promise<FileRouteError | undefined>;

export interface FieldRouteSchemaBinding {
  collection: string;
  fileField: string;
  recordField: string;
}

export interface RelationRouteSchemaBinding {
  collection: string;
  recordField: string;
}

export function startFieldRouteSchemaValidation(
  database: DatabaseManager,
  connection: string | undefined,
  binding: FieldRouteSchemaBinding,
): FileRouteSchemaValidation {
  return captureSchemaValidation(
    validateRequiredFields(database, connection, binding.collection, [
      binding.recordField,
      binding.fileField,
    ]),
    binding.collection,
  );
}

export function startRelationRouteSchemaValidation(
  database: DatabaseManager,
  connection: string | undefined,
  binding: RelationRouteSchemaBinding,
): FileRouteSchemaValidation {
  return captureSchemaValidation(
    validateRequiredFields(database, connection, binding.collection, [
      'id',
      binding.recordField,
      'fileId',
      'slot',
      'reservationExpiresAt',
      'createdAt',
      'updatedAt',
    ]),
    binding.collection,
  );
}

async function validateRequiredFields(
  database: DatabaseManager,
  connection: string | undefined,
  collection: string,
  fields: readonly string[],
): Promise<void> {
  await Promise.all([
    database
      .query(connection)
      .selectFrom('files')
      .select('id')
      .limit(0)
      .execute(),
    database
      .query(connection)
      .selectFrom(collection)
      .select(fields)
      .limit(0)
      .execute(),
  ]);
}

function captureSchemaValidation(
  validation: Promise<void>,
  collection: string,
): FileRouteSchemaValidation {
  return validation.then(
    () => undefined,
    (error: unknown) =>
      error instanceof FileRouteError
        ? error
        : invalidFileRoute(
            `File route collection "${collection}" cannot query the required fields.`,
          ),
  );
}
