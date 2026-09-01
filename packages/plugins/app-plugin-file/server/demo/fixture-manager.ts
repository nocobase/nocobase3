import type { QueryAdapter, Row } from '@nocobase/db';

import { FileUnavailableError } from '../errors.js';
import { ensureFileObject } from '../file-storage.js';
import type { FilePluginRuntime } from '../plugin-runtime.js';
import { FILE_DEMO_FIXTURES } from './fixtures.js';

type FileDemoRuntime = {
  readonly database: FilePluginRuntime['database'];
  readonly drive: FilePluginRuntime['drive'];
  readonly defaultDisk: string;
};

const readinessByDatabase = new WeakMap<
  FileDemoRuntime['database'],
  Map<string, Promise<void>>
>();

export function prepareFileDemoFixtures(
  runtime: FileDemoRuntime,
): Promise<void> {
  let readinessByDisk = readinessByDatabase.get(runtime.database);
  if (!readinessByDisk) {
    readinessByDisk = new Map();
    readinessByDatabase.set(runtime.database, readinessByDisk);
  }
  const existing = readinessByDisk.get(runtime.defaultDisk);
  if (existing) return existing;

  const readiness = ensureFileDemoFixtures(runtime).catch((cause: unknown) => {
    if (readinessByDisk.get(runtime.defaultDisk) === readiness) {
      readinessByDisk.delete(runtime.defaultDisk);
    }
    throw new FileUnavailableError('File Demo fixture initialization failed.', {
      cause,
    });
  });
  // The readiness promise is also observed by request middleware. Attach a
  // noop rejection observer here so applications that never hit the Demo
  // route do not produce an unhandled rejection during startup.
  void readiness.catch(() => undefined);
  readinessByDisk.set(runtime.defaultDisk, readiness);
  return readiness;
}

export async function ensureFileDemoFixtures(
  runtime: FileDemoRuntime,
): Promise<void> {
  const results = await Promise.allSettled(
    FILE_DEMO_FIXTURES.map((fixture) => reconcileFixture(runtime, fixture)),
  );
  const errors: unknown[] = [];
  for (const result of results) {
    if (result.status === 'rejected') errors.push(result.reason as unknown);
  }
  if (errors.length > 0) {
    throw new AggregateError(errors, 'File Demo fixture initialization failed');
  }
}

async function reconcileFixture(
  runtime: Parameters<typeof ensureFileDemoFixtures>[0],
  fixture: (typeof FILE_DEMO_FIXTURES)[number],
): Promise<void> {
  const query = runtime.database.query();
  const existing = await query
    .selectFrom(fixture.table)
    .select('id')
    .where('id', '=', fixture.id)
    .executeTakeFirst();
  if (
    !existing &&
    fixture.preserveExistingScopeRecord &&
    (await hasScopeRecord(query, fixture))
  ) {
    return;
  }
  await ensureFileObject(
    { drive: runtime.drive, defaultDisk: runtime.defaultDisk },
    fixture,
  );
  const now = new Date();
  const row: Row = {
    id: fixture.id,
    disk: runtime.defaultDisk,
    key: fixture.key,
    filename: fixture.filename,
    mimeType: fixture.mimeType,
    size: fixture.size,
    public: fixture.public,
    ...fixture.scope,
    updatedAt: now,
  };
  if (existing) {
    await query
      .updateTable(fixture.table)
      .set(row)
      .where('id', '=', fixture.id)
      .execute();
  } else {
    await query
      .insertInto(fixture.table)
      .values({ ...row, createdAt: now })
      .execute();
  }
}

async function hasScopeRecord(
  query: QueryAdapter,
  fixture: (typeof FILE_DEMO_FIXTURES)[number],
): Promise<boolean> {
  let scoped = query.selectFrom(fixture.table).select('id');
  for (const [field, value] of Object.entries(fixture.scope)) {
    scoped = scoped.where(field, '=', value);
  }
  return scoped.exists();
}
