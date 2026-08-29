import type { Row } from '@nocobase/app-database';
import type { AppPluginApplication } from '@nocobase/app-server-kit/plugins';
import { loggingToken } from '@nocobase/app-server-kit/logging';
import { ServiceProvider } from '@nocobase/service-provider';

import { FILE_DEMO_FIXTURES } from './demo/fixtures.js';
import { FileUnavailableError } from './errors.js';
import {
  isFilePluginRuntimeUnavailable,
  resolveFilePluginRuntime,
  type FilePluginRuntime,
} from './plugin-runtime.js';
import { filePluginRuntimeToken } from './runtime-token.js';
import { ensureFileObject } from './file-storage.js';

type FileDemoRuntime = {
  readonly database: FilePluginRuntime['database'];
  readonly drive: FilePluginRuntime['drive'];
  readonly defaultDisk: string;
};

const readinessByDatabase = new WeakMap<
  FileDemoRuntime['database'],
  Map<string, Promise<void>>
>();

export type FileProviderApplication = AppPluginApplication;

export default class FileProvider<
  TApplication extends FileProviderApplication = FileProviderApplication,
> extends ServiceProvider<TApplication> {
  public readonly name: string = '@nocobase/app-plugin-file';

  public override register(): void {
    this.app.container.singleton(filePluginRuntimeToken, (container) =>
      resolveFilePluginRuntime(container, this.app.config),
    );
  }

  public override async boot(): Promise<void> {
    const runtime = this.app.container.resolve(filePluginRuntimeToken);
    if (isFilePluginRuntimeUnavailable(runtime)) return;
    const logger = this.app.container.resolve(loggingToken).getLogger().child({
      module: 'app-plugin-file',
    });
    void prepareFileDemoFixtures(runtime).catch((error: unknown) => {
      logger.error({ err: error }, 'File Demo fixture initialization failed');
    });
  }
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
