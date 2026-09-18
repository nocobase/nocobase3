import { Command, Flags } from '@oclif/core';
import path from 'node:path';
import {
  readFile,
  writeFile,
  rename,
  mkdir,
  readdir,
  open,
  rm,
  chmod,
} from 'node:fs/promises';
import { DatabaseSync, backup } from 'node:sqlite';
import type { ConfigMap } from '@nocobase/config';
import { yamlParser } from '@nocobase/config/parsers/yaml';
import { resolveStandaloneAppRuntime } from '@nocobase/app-server/node';
import { resolveDefaultAppConfigFile } from '@nocobase/app-server/config';
import {
  createAppDatabaseManager,
  type AppDatabaseConfig,
} from '@nocobase/app-server/database';
import type { HubPluginConfig } from '@nocobase/app-plugin-hub/server';
import appRuntime from '../../server/runtime.js';
import { copyStorage, exists, type StorageCopy } from '../storage-files.js';

type Document = Record<string, unknown>;
function object(value: unknown): Document {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Document)
    : {};
}

export default class StorageMigrate extends Command {
  static override summary =
    'Preview or apply the offline Hub storage layout migration.';
  static override flags = {
    apply: Flags.boolean({
      default: false,
      description:
        'Copy data and switch configuration; source data is retained.',
    }),
    stopped: Flags.boolean({
      default: false,
      description: 'Confirm Hub, Host and all writers have been stopped.',
    }),
    'config-file': Flags.string({
      description: 'Explicit Hub YAML or JSON configuration file.',
    }),
    source: Flags.string({
      description: 'Existing storage root, including legacy dist/storage.',
    }),
    json: Flags.boolean({ default: false }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(StorageMigrate);
    if (flags.apply && !flags.stopped)
      this.error(
        '--apply requires --stopped. Stop Hub, Host and all data writers first.',
      );
    const rootDir = path.resolve(import.meta.dirname, '..', '..');
    const runtime = await resolveStandaloneAppRuntime(appRuntime, {
      rootDir,
      configPath: flags['config-file'],
      ...(flags.source
        ? { env: { HUB_STORAGE_DIR: path.resolve(flags.source) } }
        : {}),
    });
    const configuredFile = flags['config-file'] ?? runtime.env.APP_CONFIG_FILE;
    const configFile = configuredFile
      ? path.resolve(rootDir, configuredFile)
      : resolveDefaultAppConfigFile(runtime.configPaths);
    if (!/\.(yml|yaml|json)$/.test(configFile))
      this.error(
        'Pass --config-file pointing to an existing YAML or JSON configuration file.',
      );
    const original = await readFile(configFile);
    const parser = yamlParser();
    const document = parser.parse(original) as Document;
    const hub = runtime.config.get<HubPluginConfig>('hub')!;
    if (hub.storageLayout === 'v2' && hub.host.appRevisionsDir) {
      const result = {
        status: 'already-configured',
        message:
          'Hub is already configured for the v2 layout; no files changed.',
      };
      if (flags.json) this.logJson(result);
      else this.log(result.message);
      return;
    }
    if (!hub.host.appDeploymentsDir || hub.host.appRevisionsDir)
      this.error(
        'This command requires an existing legacy appDeploymentsDir layout.',
      );
    const sourceRoot = runtime.configPaths.storage();
    const deploymentRoot =
      path.basename(rootDir) === 'dist' ? path.dirname(rootDir) : rootDir;
    const targetRoot =
      sourceRoot === path.join(deploymentRoot, 'dist', 'storage')
        ? path.join(deploymentRoot, 'storage')
        : sourceRoot;
    const target = (relative: string): string =>
      path.join(targetRoot, relative);
    const copies: StorageCopy[] = [];
    const add = async (source: string, destination: string): Promise<void> => {
      if (
        (await exists(source)) &&
        path.resolve(source) !== path.resolve(destination)
      )
        copies.push({ source, target: destination });
    };
    // External artifact stores and explicit external disk locations retain their configuration.
    const artifact = { ...hub.artifact };
    if (
      artifact.driver === 'fs' &&
      path.resolve(artifact.location) === path.join(sourceRoot, 'app-artifacts')
    ) {
      await add(artifact.location, target('apps/artifacts'));
      artifact.location = target('apps/artifacts');
    }
    for (const app of await readdir(hub.host.appDeploymentsDir).catch(
      (error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') return [];
        throw error;
      },
    ))
      await add(
        path.join(hub.host.appDeploymentsDir, app, 'revisions'),
        target(`apps/revisions/${app}`),
      );
    await add(hub.host.appVolumesDir, target('apps/volumes'));
    const desiredRoot =
      hub.desiredConfigsDir ??
      path.join(path.dirname(hub.host.configPath), 'app-configs');
    const mappings = new Map<string, string>();
    for (const app of await readdir(desiredRoot).catch(
      (error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') return [];
        throw error;
      },
    )) {
      const directory = hub.desiredConfigsDir
        ? path.join(desiredRoot, app)
        : path.join(desiredRoot, app, 'configs');
      for (const file of await readdir(directory).catch(
        (error: NodeJS.ErrnoException) => {
          if (error.code === 'ENOENT') return [];
          throw error;
        },
      )) {
        const match = (
          hub.desiredConfigsDir
            ? /^([a-zA-Z0-9_-]+)\.yml$/
            : /^config\.([a-zA-Z0-9_-]+)\.yml$/
        ).exec(file);
        if (!match) continue;
        const source = path.join(directory, file);
        const destination = target(
          `hub/desired-configs/${app}/${match[1]}.yml`,
        );
        mappings.set(source, destination);
        await add(source, destination);
      }
    }
    await add(
      hub.logging?.deployments?.directory ??
        path.join(path.dirname(hub.host.configPath), 'deployment-logs'),
      target('hub/logs/deployments'),
    );
    const hostLogs =
      hub.host.logging?.file?.directory ?? path.join(sourceRoot, 'host/logs');
    for (const file of await readdir(hostLogs).catch(
      (error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') return [];
        throw error;
      },
    )) {
      if (file.endsWith('.log'))
        await add(path.join(hostLogs, file), target(`host/logs/host/${file}`));
    }
    await add(
      hub.host.childOutputDir ??
        path.join(path.dirname(hub.host.configPath), 'logs/host-output'),
      target('host/logs/child-output'),
    );
    const logs = runtime.config.get<{
      file?: { directory?: string };
      loggers?: { request?: { file?: { directory?: string } } };
    }>('logging');
    const logRoot = logs?.file?.directory ?? path.join(sourceRoot, 'logs');
    for (const file of await readdir(logRoot).catch(
      (error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') return [];
        throw error;
      },
    ))
      await add(
        path.join(logRoot, file),
        target(
          `hub/logs/${file.startsWith('request.') ? 'request' : 'app'}/${file}`,
        ),
      );
    const requestRoot = logs?.loggers?.request?.file?.directory;
    if (requestRoot && requestRoot !== logRoot) {
      for (const file of await readdir(requestRoot).catch(
        (error: NodeJS.ErrnoException) => {
          if (error.code === 'ENOENT') return [];
          throw error;
        },
      ))
        await add(
          path.join(requestRoot, file),
          target(`hub/logs/request/${file}`),
        );
    }
    const drive = runtime.config.get<{
      disks: Record<string, { driver: string; location?: string }>;
    }>('drive')!;
    const local = drive.disks.local;
    if (local?.driver === 'fs' && local.location === sourceRoot) {
      // The legacy local disk shared the platform root. Only the application-owned subtree is moved.
      await add(path.join(sourceRoot, 'app'), target('hub/files/app'));
    }
    const knownRoots = new Set([
      'app',
      'app-artifacts',
      'app-deployments',
      'app-volumes',
      'hub',
      'host',
      'logs',
      'apps',
      'exports',
      'dist.tar.gz',
      '.DS_Store',
    ]);
    const unknownLocalEntries =
      local?.driver === 'fs' && local.location === sourceRoot
        ? (await readdir(sourceRoot)).filter(
            (name) =>
              !knownRoots.has(name) &&
              !/\.sqlite(?:3)?(?:-wal|-shm|-journal)?$/.test(name),
          )
        : [];
    const databaseConfig = runtime.config.get<AppDatabaseConfig>('database')!;
    const connectionName = databaseConfig.default ?? 'main';
    const connection = databaseConfig.connections[
      connectionName
    ] as unknown as Document;
    const filename = connection?.database ?? connection?.filename;
    const sqliteSource =
      connection?.dialect === 'sqlite' && typeof filename === 'string'
        ? runtime.configPaths.storage(filename)
        : undefined;
    const sqliteTarget =
      sqliteSource && path.dirname(sqliteSource) === sourceRoot
        ? target('hub/database/main.sqlite')
        : undefined;
    if (sqliteSource && !(await exists(sqliteSource)))
      this.error('Configured SQLite database does not exist.');
    const existingDatabaseMarker = target(
      'hub/storage-migration/database-copied',
    );
    if (
      sqliteTarget &&
      (await exists(sqliteTarget)) &&
      !(await exists(existingDatabaseMarker))
    )
      this.error(
        'Target database already exists without a migration marker. It will not be overwritten.',
      );
    for (const entry of copies) await copyStorage(entry, false);
    const plan = {
      sourceRoot,
      targetRoot,
      copies,
      database: sqliteTarget
        ? { source: sqliteSource, target: sqliteTarget }
        : 'preserve configured database',
      configFile,
      bindingMappings: mappings.size,
      unknownLocalEntries,
    };
    if (!flags.apply) {
      if (flags.json) this.logJson(plan);
      else this.log(JSON.stringify(plan, null, 2));
      return;
    }
    if (unknownLocalEntries.length)
      this.error(
        'Unclassified local disk entries: ' +
          unknownLocalEntries.join(', ') +
          '. Move custom files to an explicitly configured disk before migration.',
      );
    const journalDir = target('hub/storage-migration');
    await mkdir(journalDir, { recursive: true, mode: 0o700 });
    const lockPath = path.join(journalDir, 'migration.lock');
    const lock = await open(lockPath, 'wx', 0o600);
    try {
      await lock.writeFile(String(process.pid));
      const backupFile = path.join(journalDir, 'config.before');
      if (await exists(backupFile)) {
        if (!(await readFile(backupFile)).equals(original))
          this.error(
            'Configuration changed since migration began. Review the saved migration before retrying.',
          );
      } else await writeFile(backupFile, original, { flag: 'wx', mode: 0o600 });
      await writeFile(
        path.join(journalDir, 'plan.json'),
        JSON.stringify(plan, null, 2),
        { mode: 0o600 },
      );
      for (const entry of copies) await copyStorage(entry, true);
      if (sqliteSource && sqliteTarget) {
        await mkdir(path.dirname(sqliteTarget), {
          recursive: true,
          mode: 0o700,
        });
        const databaseMarker = path.join(journalDir, 'database-copied');
        if (await exists(sqliteTarget)) {
          if (!(await exists(databaseMarker)))
            this.error(
              'Target database already exists without a completed copy marker. Review it before retrying; it is never overwritten.',
            );
        } else {
          const source = new DatabaseSync(sqliteSource, { readOnly: true });
          try {
            await backup(source, sqliteTarget);
            await chmod(sqliteTarget, 0o600);
          } finally {
            source.close();
          }
          await writeFile(databaseMarker, sqliteTarget, {
            flag: 'wx',
            mode: 0o600,
          });
        }
      }
      const nextDatabase = {
        ...databaseConfig,
        connections: Object.fromEntries(
          Object.entries(databaseConfig.connections).map(([name, value]) => [
            name,
            { ...value },
          ]),
        ),
      };
      if (sqliteTarget) {
        const next = nextDatabase.connections[
          connectionName
        ] as unknown as Document;
        next.database = sqliteTarget;
        next.filename = sqliteTarget;
      }
      const database = createAppDatabaseManager(
        nextDatabase,
        runtime.configPaths,
      );
      if (!database) this.error('Hub database is not configured.');
      try {
        await database.transaction(async (transaction) => {
          const records = await transaction.query
            .selectFrom('hubAppDeployments')
            .select(['id', 'config'])
            .execute();
          const bindingsBackup = path.join(
            journalDir,
            'deployment-configs.before.json',
          );
          if (!(await exists(bindingsBackup)))
            await writeFile(bindingsBackup, JSON.stringify(records), {
              flag: 'wx',
              mode: 0o600,
            });
          for (const row of records) {
            const binding =
              typeof row.config === 'string'
                ? (JSON.parse(row.config) as Document)
                : object(row.config);
            const oldVolumeRoot =
              path.resolve(hub.host.appVolumesDir) + path.sep;
            const destination =
              typeof binding.path === 'string'
                ? (mappings.get(binding.path) ??
                  (path.resolve(binding.path).startsWith(oldVolumeRoot)
                    ? path.join(
                        target('apps/volumes'),
                        path.relative(hub.host.appVolumesDir, binding.path),
                      )
                    : undefined))
                : undefined;
            if (destination)
              await transaction.query
                .updateTable('hubAppDeployments')
                .set({
                  config: JSON.stringify({ ...binding, path: destination }),
                })
                .where('id', '=', row.id)
                .execute();
          }
        });
      } finally {
        await database.destroy();
      }
      const currentHub = object(document.hub);
      const currentHost = object(currentHub.host);
      delete currentHost.appDeploymentsDir;
      document.hub = {
        ...currentHub,
        storageLayout: 'v2',
        desiredConfigsDir: target('hub/desired-configs'),
        artifact,
        logging: {
          ...object(currentHub.logging),
          deployments: {
            ...object(object(currentHub.logging).deployments),
            directory: target('hub/logs/deployments'),
          },
        },
        host: {
          ...currentHost,
          appRevisionsDir: target('apps/revisions'),
          appVolumesDir: target('apps/volumes'),
          configPath: target('host/runtime/config.yml'),
          childOutputDir: target('host/logs/child-output'),
          logging: {
            ...object(currentHost.logging),
            file: {
              ...object(object(currentHost.logging).file),
              directory: target('host/logs/host'),
            },
          },
        },
      };
      const currentLogging = object(document.logging);
      document.logging = {
        ...currentLogging,
        file: {
          ...object(currentLogging.file),
          directory: target('hub/logs/app'),
        },
        loggers: {
          ...object(currentLogging.loggers),
          request: {
            ...object(object(currentLogging.loggers).request),
            file: {
              ...object(object(object(currentLogging.loggers).request).file),
              directory: target('hub/logs/request'),
            },
          },
        },
      };
      if (sqliteSource) {
        const current = object(document.database);
        document.database = {
          ...current,
          connections: {
            ...object(current.connections),
            [connectionName]: {
              ...object(object(current.connections)[connectionName]),
              database: sqliteTarget ?? sqliteSource,
              filename: sqliteTarget ?? sqliteSource,
            },
          },
        };
      }
      if (local?.driver === 'fs' && local.location === sourceRoot) {
        const current = object(document.drive);
        document.drive = {
          ...current,
          disks: {
            ...object(current.disks),
            local: {
              ...object(object(current.disks).local),
              location: target('hub/files'),
            },
          },
        };
      }
      const contents = configFile.endsWith('.json')
        ? JSON.stringify(document, null, 2)
        : parser.serialize!(document as ConfigMap);
      const temporary = `${configFile}.storage-migration.tmp`;
      await writeFile(temporary, contents, { mode: 0o600 });
      if (!(await readFile(configFile)).equals(original))
        this.error(
          'Configuration changed during migration. Restore or reconcile it before retrying.',
        );
      await rename(temporary, configFile);
      await writeFile(
        path.join(journalDir, 'completed'),
        new Date().toISOString(),
        { mode: 0o600 },
      );
      const result = {
        status: 'completed',
        journalDir,
        message:
          'Storage migrated. Source data and config.before were retained. Verify restart, deployment, configuration and logs before removing old data.',
      };
      if (flags.json) this.logJson(result);
      else this.log(result.message);
    } finally {
      await lock.close();
      await rm(lockPath, { force: true });
    }
  }
}
