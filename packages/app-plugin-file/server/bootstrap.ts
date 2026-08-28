import type { AppPluginServerContext } from '@nocobase/app-server-kit/plugins';
import type { Row } from '@nocobase/app-database';

import { FILE_DEMO_FIXTURES } from './demo/fixtures.js';
import { FileUnavailableError } from './errors.js';
import {
  isFilePluginRuntimeUnavailable,
  resolveFilePluginRuntime,
  type FilePluginConfig,
  type FilePluginDeps,
} from './plugin-runtime.js';
import { ensureFileObject } from './file-storage.js';

type FileDemoRuntime = {
  readonly database: NonNullable<FilePluginDeps['database']>;
  readonly drive: NonNullable<FilePluginDeps['driveManager']>;
  readonly defaultDisk: string;
};

const readinessByDatabase = new WeakMap<
  FileDemoRuntime['database'],
  Map<string, Promise<void>>
>();

export type FilePluginServerContext = AppPluginServerContext<
  FilePluginDeps,
  unknown,
  FilePluginConfig
>;

export default function bootstrapFilePlugin(
  context: FilePluginServerContext,
): void {
  const runtime = resolveFilePluginRuntime(context);
  if (isFilePluginRuntimeUnavailable(runtime)) {
    return;
  }
  const logger = context.deps.logging.getLogger().child({
    module: 'app-plugin-file',
  });
  void prepareFileDemoFixtures(runtime).catch((error: unknown) => {
    logger.error({ err: error }, 'File Demo fixture initialization failed');
  });
}

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
