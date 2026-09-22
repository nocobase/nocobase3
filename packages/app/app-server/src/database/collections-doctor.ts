import { resolveDatabaseConfig } from './resolve-config.js';

import type {
  CollectionDiagnosisIssue,
  DatabaseDriverRegistration,
  DatabaseManager,
} from '@nocobase/db';

import type { AppPaths } from '../config/index.js';
import { createAppDatabaseManager } from './manager.js';
import { selectAppDatabaseConnections } from './connection-selection.js';
import type { AppDatabaseConfig } from './types.js';

export interface AppCollectionsDoctorOptions {
  readonly paths?: AppPaths;
  readonly drivers?: Record<string, DatabaseDriverRegistration>;
  /** One connection; defaults to the default connection. Exclusive with `all`. */
  readonly connection?: string;
  /** Every configured connection, external ones included. */
  readonly all?: boolean;
  /** Delete the metadata records whose tables are missing. */
  readonly fix?: boolean;
  /** Reuse an open manager instead of creating and destroying one. */
  readonly database?: DatabaseManager;
}

export interface AppCollectionsDoctorConnectionResult {
  readonly connection: string;
  readonly status: 'completed' | 'failed';
  /** Metadata records examined. */
  readonly checked?: number;
  readonly issues?: readonly CollectionDiagnosisIssue[];
  /** Records deleted, which `fix` does for orphaned ones alone. */
  readonly repaired?: readonly string[];
  readonly error?: string;
}

export interface AppCollectionsDoctorResult {
  readonly ok: boolean;
  readonly status: 'completed' | 'failed' | 'not-configured';
  readonly fix: boolean;
  readonly results: readonly AppCollectionsDoctorConnectionResult[];
}

/**
 * Compares each connection's stored Collection metadata with the physical
 * schema behind it, and optionally deletes the records whose tables are gone.
 *
 * The two are separate records of what exists. A table dropped outside a
 * migration leaves its metadata record behind, and from then on resolving that
 * Collection fails — including inside the migration that would recreate it.
 * That state is reachable by hand, so there has to be a way out of it that is
 * not "edit the internal table yourself".
 */
export async function runAppCollectionsDoctor(
  config: AppDatabaseConfig,
  options: AppCollectionsDoctorOptions = {},
): Promise<AppCollectionsDoctorResult> {
  const fix = options.fix ?? false;
  const names = selectAppDatabaseConnections(config, options);
  if (names === undefined) {
    return { ok: true, status: 'not-configured', fix, results: [] };
  }
  if (!options.database) {
    config = await resolveDatabaseConfig({
      ...config,
      drivers: { ...config.drivers, ...options.drivers },
    });
  }
  const database =
    options.database ??
    createAppDatabaseManager(config, options.paths, options.drivers);
  if (!database) {
    return { ok: true, status: 'not-configured', fix, results: [] };
  }

  const results: AppCollectionsDoctorConnectionResult[] = [];
  try {
    for (const name of names) {
      try {
        results.push(await diagnoseConnection(database, name, fix));
      } catch (error) {
        results.push({
          connection: name,
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  } finally {
    if (!options.database) await database.destroy();
  }

  const ok = results.every((result) => result.status === 'completed');
  return {
    ok,
    status: ok ? 'completed' : 'failed',
    fix,
    results,
  };
}

async function diagnoseConnection(
  database: DatabaseManager,
  name: string,
  fix: boolean,
): Promise<AppCollectionsDoctorConnectionResult> {
  const connection = database.connection(name);
  const diagnosis = await connection.collections.diagnose();
  if (!fix) {
    return {
      connection: name,
      status: 'completed',
      checked: diagnosis.checked,
      issues: diagnosis.issues,
    };
  }

  // Only the orphaned ones: the rest describe a table that exists and
  // disagrees, which a migration has to reconcile.
  const repaired: string[] = [];
  for (const issue of diagnosis.issues) {
    if (!issue.orphaned) continue;
    await connection.collectionMetadata.removeDocument(issue.name);
    repaired.push(issue.name);
  }
  if (repaired.length) connection.collections.invalidate();

  return {
    connection: name,
    status: 'completed',
    checked: diagnosis.checked,
    issues: diagnosis.issues,
    repaired,
  };
}
