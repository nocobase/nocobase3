import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

interface RegistrySource {
  readonly include: readonly string[];
  readonly root: string;
  readonly target: string;
}

interface RegistryItem {
  readonly dependencies: readonly string[];
  readonly meta: {
    readonly nocobase: {
      readonly requiresPlugins: Readonly<Record<string, string>>;
    };
  };
  readonly name: string;
  readonly registryDependencies: readonly string[];
  readonly source: RegistrySource;
}

interface RegistryConfig {
  readonly items: readonly RegistryItem[];
}

interface PackageMetadata {
  readonly name: string;
  readonly version: string;
}

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const repositoryRoot = path.resolve(packageRoot, '../../..');

describe('@nocobase/app-plugin-notification-in-app Registry contract', () => {
  it('publishes application-owned in-app notification source', () => {
    const config = JSON.parse(
      fs.readFileSync(path.join(packageRoot, 'registry.config.json'), 'utf8'),
    ) as RegistryConfig;

    expect(config.items).toEqual([
      expect.objectContaining({
        name: 'in-app-ui',
        dependencies: expect.arrayContaining([
          expect.stringMatching(/^@nocobase\/app-client@\^/u),
          expect.stringMatching(
            /^@nocobase\/app-plugin-notification-in-app@\^/u,
          ),
          'react-router@^7.0.2',
        ]),
        registryDependencies: ['alert', 'badge', 'button', 'card'],
        source: {
          root: 'registry/in-app-ui',
          target: 'client/extensions/nocobase-notification-in-app-ui',
          include: ['.'],
        },
      }),
    ]);
    expect(
      fs.existsSync(path.join(packageRoot, 'registry/in-app-ui/index.ts')),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(packageRoot, 'registry/in-app-ui/extension.ts')),
    ).toBe(false);

    const item = config.items[0];
    expectCurrentOrNextPrereleaseDependency(
      item?.dependencies,
      '../../app/app-client/package.json',
    );
    expectCurrentOrNextPrereleaseDependency(item?.dependencies, 'package.json');
    const packageName = '@nocobase/app-plugin-notification-in-app';
    const dependency = item?.dependencies.find((value) =>
      value.startsWith(`${packageName}@^`),
    );
    expect(dependency).toBeDefined();
    const minimumVersion = dependency?.slice(`${packageName}@^`.length);
    expect(item?.meta.nocobase.requiresPlugins[packageName]).toBe(
      `>=${minimumVersion} <0.3.0`,
    );
  });

  it('materializes an application-owned copy that uses the injected AppClient', async () => {
    const temporaryRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'nocobase-notification-in-app-registry-'),
    );
    try {
      execFileSync(
        process.execPath,
        [
          path.join(repositoryRoot, 'scripts/registry.mjs'),
          'materialize',
          '--package',
          packageRoot,
          '--output-root',
          temporaryRoot,
        ],
        { cwd: repositoryRoot },
      );
      const target = path.join(
        temporaryRoot,
        'client/extensions/nocobase-notification-in-app-ui',
      );
      expect(fs.existsSync(path.join(target, 'runtime.tsx'))).toBe(true);
      const source = fs
        .readdirSync(target)
        .filter((file) => /\.[cm]?[jt]sx?$/u.test(file))
        .map((file) => fs.readFileSync(path.join(target, file), 'utf8'))
        .join('\n');
      expect(source).toContain("from '@nocobase/app-client'");
      expect(source).not.toContain('@nocobase/app-portal-sdk');
      expect(source).not.toContain('getPortalBase');

      const materializedApi = (await import(
        /* @vite-ignore */ pathToFileURL(path.join(target, 'api.ts')).href
      )) as typeof import('../registry/in-app-ui/api.js');
      const request = async <T>(requestPath: string): Promise<T> => {
        expect(requestPath).toBe('notifications/in-app/unread-count');
        return { count: 6 } as T;
      };
      await expect(
        materializedApi.fetchUnreadCount({
          request,
          stream: async () => new ReadableStream<Uint8Array>(),
        }),
      ).resolves.toBe(6);
    } finally {
      fs.rmSync(temporaryRoot, { recursive: true, force: true });
    }
  });
});

function expectCurrentOrNextPrereleaseDependency(
  dependencies: readonly string[] | undefined,
  manifestPath: string,
): void {
  const metadata = JSON.parse(
    fs.readFileSync(path.resolve(packageRoot, manifestPath), 'utf8'),
  ) as PackageMetadata;
  const prefix = `${metadata.name}@^`;
  const dependency = dependencies?.find((value) => value.startsWith(prefix));
  const declaredVersion = dependency?.slice(prefix.length);
  expect([metadata.version, incrementPrerelease(metadata.version)]).toContain(
    declaredVersion,
  );
}

function incrementPrerelease(version: string): string {
  return version.replace(
    /-(\D+\.)(\d+)$/u,
    (_, prefix, sequence: string) => `-${prefix}${Number(sequence) + 1}`,
  );
}
