import { readFileSync } from 'node:fs';

import type { ApiClient } from '@nocobase/app-client';
import { describe, expect, it } from 'vitest';

import {
  createFileRoute,
  DEFAULT_FILE_ROUTE_VISIBILITY,
  default as fileServerPlugin,
  FILE_INVENTORY_RESOURCE as serverInventoryResource,
  type CreateFileRouteOptions,
  type FileRouteAction,
  type FileStore,
} from '@nocobase/app-plugin-file/server';
import * as serverApi from '@nocobase/app-plugin-file/server';
import {
  createFilesClient,
  default as fileClientPlugin,
  FILE_INVENTORY_RESOURCE as clientInventoryResource,
  FilePreviewField,
  isSafeImagePreview,
  resolveFilePreviewKind,
  resolveOfficeEmbedUrl,
  type FilesClient,
} from '@nocobase/app-plugin-file/client';
import * as clientApi from '@nocobase/app-plugin-file/client';

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
    const clientFactory: (options: {
      api: ApiClient;
      endpoint: string;
    }) => FilesClient = createFilesClient;
    const previewField = FilePreviewField;
    const storeImport: FileStore | undefined = undefined;
    const actionsAreFrozen: FrozenFileRouteActions = true;

    expect(routeFactory).toBeTypeOf('function');
    expect(clientFactory).toBeTypeOf('function');
    expect(previewField).toBeTypeOf('function');
    expect(isSafeImagePreview).toBeTypeOf('function');
    expect(resolveFilePreviewKind).toBeTypeOf('function');
    expect(resolveOfficeEmbedUrl).toBeTypeOf('function');
    expect(storeImport).toBeUndefined();
    expect(actionsAreFrozen).toBe(true);
    expect(DEFAULT_FILE_ROUTE_VISIBILITY).toEqual({
      default: 'private',
      allowClientOverride: false,
    });
    expect(Object.isFrozen(DEFAULT_FILE_ROUTE_VISIBILITY)).toBe(true);
    expect(serverInventoryResource).toBe('file.inventory');
    expect(clientInventoryResource).toBe(serverInventoryResource);
  });

  it('contributes the inventory routes and locales without business schema', () => {
    expect(fileClientPlugin()).toMatchObject({
      packageName: '@nocobase/app-plugin-file',
      routes: [
        {
          parent: 'settings',
          routes: [
            {
              name: 'files',
              path: '/files',
            },
          ],
        },
      ],
      locales: {
        'en-US': expect.any(Function),
        'zh-CN': expect.any(Function),
      },
    });
    expect(fileServerPlugin).toMatchObject({
      packageName: '@nocobase/app-plugin-file',
      serviceProviders: [],
      routes: [{ scope: 'api', createRouter: expect.any(Function) }],
      locales: expect.any(Function),
    });
    expect(fileServerPlugin.database).toBeUndefined();
    expect(clientApi).not.toHaveProperty('FILE_ROUTE_IDS');
    expect(clientApi).not.toHaveProperty('FILE_DEMO_AVATAR_MIME_TYPES');
    expect(clientApi).not.toHaveProperty('FILE_DEMO_ORDER_MIME_TYPES');
  });

  it('has no manifest or TypeScript source dependency on the Portal SDK', () => {
    const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as {
      readonly dependencies?: Readonly<Record<string, string>>;
      readonly devDependencies?: Readonly<Record<string, string>>;
      readonly peerDependencies?: Readonly<Record<string, string>>;
    };
    const tsconfig = readFileSync('tsconfig.json', 'utf8');

    for (const dependencies of [
      packageJson.dependencies,
      packageJson.devDependencies,
      packageJson.peerDependencies,
    ]) {
      expect(dependencies).not.toHaveProperty('@nocobase/app-portal-sdk');
    }
    expect(tsconfig).not.toContain('app-portal-sdk');
  });

  it('declares dependencies imported by published client components', () => {
    const metadata = JSON.parse(readFileSync('package.json', 'utf8')) as {
      dependencies: Record<string, string>;
    };
    for (const name of [
      '@base-ui/react',
      'lucide-react',
      'react-markdown',
      'remark-gfm',
    ]) {
      expect(metadata.dependencies[name]).toBeTruthy();
    }
  });

  it('keeps application assembly APIs internal', () => {
    expect(Object.keys(serverApi).sort()).toEqual([
      'DEFAULT_FILE_ROUTE_VISIBILITY',
      'FILE_INVENTORY_RESOURCE',
      'createFileRoute',
      'default',
    ]);
    expect(serverApi).not.toHaveProperty('resolveFilePluginRuntime');
    expect(serverApi).not.toHaveProperty('bootstrapFilePlugin');
    expect(serverApi).not.toHaveProperty('registerRoutes');
    expect(serverApi).not.toHaveProperty('createFileDemoRoutes');

    const barrel = readFileSync('server/index.ts', 'utf8');
    expect(barrel).not.toMatch(/plugin-runtime|bootstrap|routes\/index/u);
    expect(barrel).not.toMatch(/FilePlugin(?:Runtime|Server|Routes)Context/u);
  });

  it('publishes only supported client and server entry points', () => {
    const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as {
      readonly exports: Readonly<Record<string, unknown>>;
      readonly publishConfig: {
        readonly exports: Readonly<Record<string, unknown>>;
      };
    };
    const bootstrapEntry = ['./client', 'bootstrap'].join('/');
    const providersEntry = ['./client', 'providers'].join('/');

    expect(packageJson.exports).not.toHaveProperty(bootstrapEntry);
    expect(packageJson.exports).not.toHaveProperty(providersEntry);
    expect(packageJson.publishConfig.exports).not.toHaveProperty(
      bootstrapEntry,
    );
    expect(packageJson.publishConfig.exports).not.toHaveProperty(
      providersEntry,
    );
    expect(packageJson.exports).toHaveProperty('./client');
    expect(packageJson.exports).toHaveProperty('./client/plugin');
    expect(packageJson.publishConfig.exports).toHaveProperty('./client');
    expect(packageJson.publishConfig.exports).toHaveProperty('./client/plugin');
    expect(packageJson.exports).toHaveProperty('./server');
    expect(packageJson.publishConfig.exports).toHaveProperty('./server');
    expect(packageJson.exports).not.toHaveProperty('./client/routes');
    expect(packageJson.exports).not.toHaveProperty('./client/route-contracts');
    expect(packageJson.publishConfig.exports).not.toHaveProperty(
      './client/routes',
    );
    expect(packageJson.publishConfig.exports).not.toHaveProperty(
      './client/route-contracts',
    );
  });
});
