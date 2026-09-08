import { existsSync, statSync } from 'node:fs';
import path from 'node:path';

import { validateDatabaseOwnership } from './ownership.js';

import type { ConfigPaths } from '../config/index.js';
import type { AppDatabaseConfig, AppDatabaseMigrationConfig } from './types.js';

export type AppDatabaseTaskKind = 'migrations' | 'seeds';

export interface AppDatabaseTaskSelection {
  connection?: string;
  all?: boolean;
  autoRun?: boolean;
}

export interface AppDatabaseTask {
  connection: string;
  kind: AppDatabaseTaskKind;
  config: AppDatabaseMigrationConfig;
  skipReason?: 'external' | 'auto-run-disabled';
}

export function defaultConnectionName(
  config: AppDatabaseConfig,
): string | undefined {
  return config.default ?? Object.keys(config.connections)[0];
}

/** Resolve the entire plan before any database is opened or modified. */
export function planAppDatabaseTasks(
  config: AppDatabaseConfig,
  paths: ConfigPaths | undefined,
  kinds: readonly AppDatabaseTaskKind[],
  selection: AppDatabaseTaskSelection = {},
): AppDatabaseTask[] {
  if (selection.connection !== undefined && selection.all) {
    throw new Error('--connection and --all are mutually exclusive.');
  }
  const primary = defaultConnectionName(config);
  if (primary === 'none' || !primary) {
    if (selection.connection !== undefined)
      throw new Error('Database is not configured.');
    return [];
  }
  if (!Object.hasOwn(config.connections, primary)) {
    throw new Error(`Unknown default database connection "${primary}".`);
  }
  validateDatabaseOwnership(config, paths);
  const names =
    selection.all || selection.autoRun
      ? Object.keys(config.connections).sort((a, b) =>
          a === primary ? -1 : b === primary ? 1 : a < b ? -1 : a > b ? 1 : 0,
        )
      : [selection.connection ?? primary];
  return names.flatMap((name) => {
    if (!Object.hasOwn(config.connections, name)) {
      throw new Error(`Unknown database connection "${name}".`);
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
      throw new Error(
        `Database connection "${name}" must use letters, digits, underscores or hyphens.`,
      );
    }
    const connection = config.connections[name];
    const external = connection.schemaManagement === 'external';
    if (external && !selection.all && !selection.autoRun) {
      throw new Error(
        `Database connection "${name}" is external; migrations and seeds are not supported.`,
      );
    }
    return kinds.map((kind) => {
      const local = connection[kind];
      const legacy = name === primary ? config[kind] : undefined;
      // Legacy values (including existing DB_* environment mappings) retain precedence.
      // Source selection is exclusive: different explicit sources must never be merged.
      if (
        legacy?.directory &&
        local?.directory &&
        legacy.directory !== local.directory
      ) {
        throw new Error(
          `Conflicting legacy and connection ${kind} directories for "${name}".`,
        );
      }
      if (legacy?.sources && local?.sources) {
        throw new Error(`Configure ${kind} sources only once for "${name}".`);
      }
      const options = { ...local, ...legacy };
      if (options.directory && options.sources) {
        throw new Error(
          `Configure either ${kind} directory or sources for "${name}", not both.`,
        );
      }
      const root =
        paths?.database() ??
        config.taskSources?.directory ??
        path.resolve('database');
      const modern = path.join(root, name, kind);
      const old = path.join(root, kind);
      let directory = options.directory;
      if (!directory && !options.sources && !external) {
        if (name === primary && existsSync(old)) {
          if (existsSync(modern)) {
            throw new Error(
              `Both legacy and connection ${kind} directories exist for "${name}". Configure one directory explicitly.`,
            );
          }
          directory = old;
        } else directory = modern;
      }
      const resolvePath = (value: string): string =>
        path.resolve(paths?.root() ?? process.cwd(), value);
      const packageName =
        options.packageName ?? config.taskSources?.packageName ?? 'app';
      const appSources = options.sources?.map((source) => ({
        ...source,
        directory: resolvePath(source.directory),
      })) ?? [
        {
          packageName,
          directory: resolvePath(directory ?? modern),
          extensions: options.extensions,
        },
      ];
      const sources = [
        ...appSources,
        ...(name === primary ? (config.taskSources?.[kind] ?? []) : []),
      ];
      const autoRun = options.autoRun ?? name === primary;
      if (!external && (!selection.autoRun || autoRun)) {
        for (const source of sources) {
          if (
            existsSync(source.directory) &&
            !statSync(source.directory).isDirectory()
          ) {
            throw new Error(
              `Database ${kind} source is not a directory: ${source.directory}`,
            );
          }
        }
        if (options.directory || options.sources) {
          for (const source of appSources) {
            if (!existsSync(source.directory)) {
              throw new Error(
                `Explicit database ${kind} source is missing for "${name}": ${source.directory}`,
              );
            }
          }
        }
      }
      return {
        connection: name,
        kind,
        config: {
          ...options,
          packageName,
          directory: resolvePath(directory ?? modern),
          sources,
          autoRun,
        },
        skipReason: external
          ? 'external'
          : selection.autoRun && !autoRun
            ? 'auto-run-disabled'
            : undefined,
      };
    });
  });
}
