import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  createFileRoute,
  createFilesService,
  DEFAULT_FILE_ROUTE_VISIBILITY,
  type CreateFileRouteOptions,
  type CreateFilesServiceOptions,
  type FileRouteAction,
  type FileStore,
  type FilesService,
} from '@nocobase/app-plugin-files/server';
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
    const serverFactory: (options: CreateFilesServiceOptions) => FilesService =
      createFilesService;
    const routeFactory: (options: CreateFileRouteOptions) => unknown =
      createFileRoute;
    const clientFactory: (options: { endpoint: string }) => FilesClient =
      createFilesClient;
    const storeImport: FileStore | undefined = undefined;
    const actionsAreFrozen: FrozenFileRouteActions = true;

    expect(serverFactory).toBeTypeOf('function');
    expect(routeFactory).toBeTypeOf('function');
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
      'createFileRoute',
      'createFilesService',
    ]);
    expect(serverApi).not.toHaveProperty('createPluginFilesService');
    expect(serverApi).not.toHaveProperty('bootstrapFilesPlugin');
    expect(serverApi).not.toHaveProperty('registerFilesRoutes');
    expect(serverApi).not.toHaveProperty('createFilesRoutes');

    const barrel = readFileSync('server/index.ts', 'utf8');
    expect(barrel).not.toMatch(/plugin-runtime|bootstrap|routes\/index/u);
    expect(barrel).not.toMatch(/FilesPlugin(?:Runtime|Server|Routes)Context/u);
  });
});
