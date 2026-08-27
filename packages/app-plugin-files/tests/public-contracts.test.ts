import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  createDatabaseFileStore,
  createFileRoute,
  DEFAULT_FILE_ROUTE_VISIBILITY,
  type CreateFileRouteOptions,
  type DatabaseFileStoreOptions,
  type FileRouteAction,
  type FileStore,
} from '@nocobase/app-plugin-files/server';
import type { DatabaseManager } from '@nocobase/app-database';
import * as serverApi from '@nocobase/app-plugin-files/server';
import {
  createFilesClient,
  FILES_ROUTE_IDS,
  type FilesClient,
} from '@nocobase/app-plugin-files/client';

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

describe('files plugin public contracts', () => {
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
    expect(FILES_ROUTE_IDS.demo).toBe('@nocobase/app-plugin-files:demo');
    expect(Object.isFrozen(FILES_ROUTE_IDS)).toBe(true);
  });

  it('keeps plugin assembly APIs internal', () => {
    expect(Object.keys(serverApi).sort()).toEqual([
      'DEFAULT_FILE_ROUTE_VISIBILITY',
      'createDatabaseFileStore',
      'createFileRoute',
    ]);
    expect(serverApi).not.toHaveProperty('resolveFilesPluginRuntime');
    expect(serverApi).not.toHaveProperty('bootstrapFilesPlugin');
    expect(serverApi).not.toHaveProperty('registerRoutes');
    expect(serverApi).not.toHaveProperty('createFilesDemoRoutes');

    const barrel = readFileSync('server/index.ts', 'utf8');
    expect(barrel).not.toMatch(/plugin-runtime|bootstrap|routes\/index/u);
    expect(barrel).not.toMatch(/FilesPlugin(?:Runtime|Server|Routes)Context/u);
  });
});
