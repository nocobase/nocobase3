import { existsSync, readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  createDatabaseFileStore,
  createFileRoute,
  DEFAULT_FILE_ROUTE_VISIBILITY,
  type CreateFileRouteOptions,
  type DatabaseFileStoreOptions,
  type FileRouteAction,
  type FileStore,
} from '@nocobase/app-plugin-file/server';
import type { DatabaseManager } from '@nocobase/app-database';
import * as serverApi from '@nocobase/app-plugin-file/server';
import {
  createFilesClient,
  FILE_ROUTE_IDS,
  type FilesClient,
} from '@nocobase/app-plugin-file/client';

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <
    Value,
  >() => Value extends Right ? 1 : 2
    ? true
    : false;
type Expect<Value extends true> = Value;
type FrozenFileRouteActions = Expect<
  Equal<FileRouteAction, 'list' | 'upload' | 'read' | 'issue-token' | 'delete'>
>;

describe('file plugin public contracts', () => {
  it('exposes stable server and client entry points', () => {
    const routeFactory: (options: CreateFileRouteOptions) => unknown =
      createFileRoute;
    const storeFactory: (
      database: DatabaseManager,
      options: DatabaseFileStoreOptions,
    ) => FileStore = createDatabaseFileStore;
    const clientFactory: (options: { endpoint: string }) => FilesClient =
      createFilesClient;
    const storeImport: FileStore | undefined = undefined;
    const actionsAreFrozen: FrozenFileRouteActions = true;

    expect(routeFactory).toBeTypeOf('function');
    expect(storeFactory).toBeTypeOf('function');
    expect(clientFactory).toBeTypeOf('function');
    expect(storeImport).toBeUndefined();
    expect(actionsAreFrozen).toBe(true);
    expect(DEFAULT_FILE_ROUTE_VISIBILITY).toEqual({
      default: 'private',
      allowClientOverride: false,
    });
    expect(Object.isFrozen(DEFAULT_FILE_ROUTE_VISIBILITY)).toBe(true);
  });

  it('freezes the demo route id', () => {
    expect(FILE_ROUTE_IDS.demo).toBe('@nocobase/app-plugin-file:demo');
    expect(Object.isFrozen(FILE_ROUTE_IDS)).toBe(true);
  });

  it('keeps plugin assembly APIs internal', () => {
    expect(Object.keys(serverApi).sort()).toEqual([
      'DEFAULT_FILE_ROUTE_VISIBILITY',
      'createDatabaseFileStore',
      'createFileRoute',
    ]);
    expect(serverApi).not.toHaveProperty('resolveFilePluginRuntime');
    expect(serverApi).not.toHaveProperty('bootstrapFilePlugin');
    expect(serverApi).not.toHaveProperty('registerRoutes');
    expect(serverApi).not.toHaveProperty('createFileDemoRoutes');

    const barrel = readFileSync('server/index.ts', 'utf8');
    expect(barrel).not.toMatch(/plugin-runtime|bootstrap|routes\/index/u);
    expect(barrel).not.toMatch(/FilePlugin(?:Runtime|Server|Routes)Context/u);
  });

  it('publishes the renamed Agent Skill from the package root', () => {
    const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as {
      readonly files: readonly string[];
      readonly exports: Readonly<Record<string, unknown>>;
      readonly publishConfig: {
        readonly exports: Readonly<Record<string, unknown>>;
      };
      readonly nocobase: {
        readonly plugin: { readonly client: Readonly<Record<string, string>> };
      };
    };
    const skillPath = '.agents/skills/nocobase-app-plugin-file/SKILL.md';
    const bootstrapEntry = ['./client', 'bootstrap'].join('/');
    const providersEntry = ['./client', 'providers'].join('/');

    expect(packageJson.files).toContain('.agents');
    expect(packageJson.exports).not.toHaveProperty(`./${skillPath}`);
    expect(packageJson.publishConfig.exports).not.toHaveProperty(
      `./${skillPath}`,
    );
    expect(packageJson.exports).not.toHaveProperty(bootstrapEntry);
    expect(packageJson.exports).not.toHaveProperty(providersEntry);
    expect(packageJson.publishConfig.exports).not.toHaveProperty(
      bootstrapEntry,
    );
    expect(packageJson.publishConfig.exports).not.toHaveProperty(
      providersEntry,
    );
    expect(packageJson.nocobase.plugin.client).toEqual({
      routes: './client/routes',
    });
    expect(existsSync(skillPath)).toBe(true);
    expect(readFileSync(skillPath, 'utf8')).toContain(
      'name: nocobase-app-plugin-file',
    );
    expect(packageJson.files).not.toContain('docs');
    expect(existsSync('docs')).toBe(false);
    expect(
      existsSync(
        '.agents/skills/nocobase-app-plugin-file/reference/quick-start.md',
      ),
    ).toBe(true);
    expect(existsSync('skills')).toBe(false);
  });
});
