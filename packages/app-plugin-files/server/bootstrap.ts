import type { AppPluginServerContext } from '@nocobase/app-server-kit/plugins';
import type { Row } from '@nocobase/app-database';

import { FILES_DEMO_FIXTURES } from './demo/fixtures.js';
import {
  isFilesPluginRuntimeUnavailable,
  resolveFilesPluginRuntime,
  type FilesPluginConfig,
  type FilesPluginDeps,
} from './plugin-runtime.js';
import { ensureFileObject, removeFileObject } from './file-storage.js';

export type FilesPluginServerContext = AppPluginServerContext<
  FilesPluginDeps,
  unknown,
  FilesPluginConfig
>;

export default function bootstrapFilesPlugin(
  context: FilesPluginServerContext,
): void {
  const runtime = resolveFilesPluginRuntime(context);
  if (isFilesPluginRuntimeUnavailable(runtime)) {
    return;
  }
  const logger = context.deps.logging.getLogger().child({
    module: 'app-plugin-files',
  });
  void ensureFilesDemoFixtures(runtime).catch((error: unknown) => {
    logger.error({ err: error }, 'Files Demo fixture initialization failed');
  });
}

export async function ensureFilesDemoFixtures(runtime: {
  readonly database: NonNullable<FilesPluginDeps['database']>;
  readonly drive: NonNullable<FilesPluginDeps['driveManager']>;
  readonly defaultDisk: string;
}): Promise<void> {
  const results = await Promise.allSettled(
    FILES_DEMO_FIXTURES.map((fixture) => reconcileFixture(runtime, fixture)),
  );
  const errors: unknown[] = [];
  for (const result of results) {
    if (result.status === 'rejected') errors.push(result.reason as unknown);
  }
  if (errors.length > 0) {
    throw new AggregateError(
      errors,
      'Files Demo fixture initialization failed',
    );
  }
}

async function reconcileFixture(
  runtime: Parameters<typeof ensureFilesDemoFixtures>[0],
  fixture: (typeof FILES_DEMO_FIXTURES)[number],
): Promise<void> {
  const query = runtime.database.query();
  const existing = await query
    .selectFrom(fixture.table)
    .select(['id', 'disk', 'key'])
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
    if (
      String(existing.disk) !== runtime.defaultDisk ||
      String(existing.key) !== fixture.key
    ) {
      await removeFileObject(runtime.drive, {
        disk: String(existing.disk),
        key: String(existing.key),
      });
    }
  } else {
    await query
      .insertInto(fixture.table)
      .values({ ...row, createdAt: now })
      .execute();
  }
}
