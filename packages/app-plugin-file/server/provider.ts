import type { Row } from '@nocobase/app-database';
import type { AppPluginApplication } from '@nocobase/app-server-kit/plugins';
import { loggingToken } from '@nocobase/logging';
import { ServiceProvider } from '@nocobase/service-provider';

import { FILE_DEMO_FIXTURES } from './demo/fixtures.js';
import { FileUnavailableError } from './errors.js';
import {
  isFilePluginRuntimeUnavailable,
  resolveFilePluginRuntime,
  type FilePluginConfig,
  type FilePluginRuntime,
} from './plugin-runtime.js';
import { filePluginRuntimeToken } from './runtime-token.js';
import { ensureFileObject, removeFileObject } from './file-storage.js';

type FileDemoRuntime = {
  readonly database: FilePluginRuntime['database'];
  readonly drive: FilePluginRuntime['drive'];
  readonly defaultDisk: string;
  readonly diskNames?: readonly string[];
};

const readinessByDatabase = new WeakMap<
  FileDemoRuntime['database'],
  Map<string, Promise<void>>
>();

export type FileProviderApplication = AppPluginApplication<FilePluginConfig>;

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
  } else {
    await query
      .insertInto(fixture.table)
      .values({ ...row, createdAt: now })
      .execute();
  }
  await removeStaleFixtureObjects(
    runtime,
    fixture,
    existing
      ? {
          disk: Reflect.get(existing, 'disk'),
          key: Reflect.get(existing, 'key'),
        }
      : undefined,
  );
}

async function removeStaleFixtureObjects(
  runtime: FileDemoRuntime,
  fixture: (typeof FILE_DEMO_FIXTURES)[number],
  existing: { readonly disk: unknown; readonly key: unknown } | undefined,
): Promise<void> {
  const locations = new Map<string, { disk: string; key: string }>();
  if (existing) {
    const disk = String(existing.disk);
    const key = String(existing.key);
    locations.set(`${disk}\0${key}`, { disk, key });
  }
  for (const disk of runtime.diskNames ?? []) {
    locations.set(`${disk}\0${fixture.key}`, { disk, key: fixture.key });
  }
  locations.delete(`${runtime.defaultDisk}\0${fixture.key}`);

  const results = await Promise.allSettled(
    [...locations.values()].map((location) =>
      removeFileObject(runtime.drive, location),
    ),
  );
  const errors = results.flatMap((result) =>
    result.status === 'rejected' ? [result.reason as unknown] : [],
  );
  if (errors.length > 0) {
    throw new AggregateError(
      errors,
      'Stale File Demo objects could not be removed.',
    );
  }
}
