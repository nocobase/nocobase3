import { existsSync, readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  createFileRoute,
  DEFAULT_FILE_ROUTE_VISIBILITY,
  default as fileServerPlugin,
  type CreateFileRouteOptions,
  type FileRouteAction,
  type FileStore,
} from '@nocobase/app-plugin-file/server';
import * as serverApi from '@nocobase/app-plugin-file/server';
import {
  createFilesClient,
  default as fileClientPlugin,
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
    const clientFactory: (options: { endpoint: string }) => FilesClient =
      createFilesClient;
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
  });

  it('contributes locales without built-in business UI, API routes, or database schema', () => {
    expect(fileClientPlugin()).toMatchObject({
      packageName: '@nocobase/app-plugin-file',
      routes: [],
      locales: {
        'en-US': expect.any(Function),
        'zh-CN': expect.any(Function),
      },
    });
    expect(fileServerPlugin).toMatchObject({
      packageName: '@nocobase/app-plugin-file',
      serviceProviders: [],
      routes: [],
      locales: expect.any(Function),
    });
    expect(fileServerPlugin.database).toBeUndefined();
    expect(clientApi).not.toHaveProperty('FILE_ROUTE_IDS');
    expect(clientApi).not.toHaveProperty('FILE_DEMO_AVATAR_MIME_TYPES');
    expect(clientApi).not.toHaveProperty('FILE_DEMO_ORDER_MIME_TYPES');
  });

  it('keeps application assembly APIs internal', () => {
    expect(Object.keys(serverApi).sort()).toEqual([
      'DEFAULT_FILE_ROUTE_VISIBILITY',
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

  it('publishes the renamed Agent Skill from the package root', () => {
    const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as {
      readonly files: readonly string[];
      readonly exports: Readonly<Record<string, unknown>>;
      readonly publishConfig: {
        readonly exports: Readonly<Record<string, unknown>>;
      };
    };
    const skillPath = 'skills/nocobase-app-plugin-file/SKILL.md';
    const quickStartPath =
      'skills/nocobase-app-plugin-file/reference/quick-start.md';
    const bootstrapEntry = ['./client', 'bootstrap'].join('/');
    const providersEntry = ['./client', 'providers'].join('/');

    expect(packageJson.files).toContain('skills');
    expect(packageJson.files).not.toContain('database');
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
    expect(existsSync(skillPath)).toBe(true);
    const skill = readFileSync(skillPath, 'utf8');
    const quickStart = readFileSync(quickStartPath, 'utf8');
    expect(skill).toContain('name: nocobase-app-plugin-file');
    expect(skill).toContain('application source');
    expect(quickStart).toContain('database/migrations/');
    expect(quickStart).toContain('server/routes/index.ts');
    expect(quickStart).toContain('client/routes.ts');
    expect(`${skill}\n${quickStart}`).not.toMatch(
      /The business plugin|business plugin's|AppPluginApplication|passed to defineServerPlugin/u,
    );
    expect(packageJson.files).not.toContain('docs');
    expect(existsSync('docs')).toBe(false);
    expect(existsSync(quickStartPath)).toBe(true);
  });
});
