import { execFile, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

interface RegistrySource {
  readonly include: readonly string[];
  readonly root: string;
  readonly target: string;
}

interface RegistryItem {
  readonly dependencies: readonly string[];
  readonly description: string;
  readonly docs: string;
  readonly meta: {
    readonly nocobase?: {
      readonly requiresPlugins?: Readonly<Record<string, string>>;
    };
    readonly ownership: string;
    readonly upgradePolicy: string;
  };
  readonly name: string;
  readonly registryDependencies: readonly string[];
  readonly source: RegistrySource;
  readonly title: string;
  readonly type: string;
}

interface RegistryConfig {
  readonly items: readonly RegistryItem[];
}

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const repoRoot = path.resolve(packageRoot, '../../..');
const execFileAsync = promisify(execFile);

function read(relativePath: string): string {
  return fs.readFileSync(path.join(packageRoot, relativePath), 'utf8');
}

function filesUnder(relativeRoot: string): readonly string[] {
  const absoluteRoot = path.join(packageRoot, relativeRoot);
  return fs
    .readdirSync(absoluteRoot, { withFileTypes: true })
    .flatMap((entry) => {
      const relativeEntry = path.join(relativeRoot, entry.name);
      return entry.isDirectory() ? filesUnder(relativeEntry) : [relativeEntry];
    });
}

function sourceFiles(item: RegistryItem): readonly string[] {
  return filesUnder(item.source.root).filter((file) =>
    /\.[cm]?[jt]sx?$/u.test(file),
  );
}

describe('file plugin Registry contract', () => {
  const config = JSON.parse(read('registry.config.json')) as RegistryConfig;

  it('publishes only the application-owned component source item', () => {
    expect(config.items.map(({ name }) => name)).toEqual(['component-ui']);
    const [item] = config.items;
    expect(item).toMatchObject({
      type: 'registry:component',
      registryDependencies: ['button', 'dialog'],
      source: {
        root: 'registry/component-ui',
        target: 'client/extensions/nocobase-file-component-ui',
        include: ['.'],
      },
      meta: {
        ownership: 'application',
        upgradePolicy: 'three-way-merge',
      },
    });
    expect(item?.title).toBeTruthy();
    expect(item?.description).toBeTruthy();
    expect(item?.docs).toBeTruthy();
    expect(item?.dependencies).toContain('@nocobase/app-plugin-file@^0.0.1');
    expect(item?.dependencies).toContain('react-markdown@^10.1.0');
    expect(item?.dependencies).toContain('remark-gfm@^4.0.1');
    expect(item?.meta.nocobase?.requiresPlugins).toEqual({
      '@nocobase/app-plugin-file': '>=0.0.1 <0.1.0',
    });
    expect(
      item?.dependencies.every((dependency) =>
        /^(?:@[^/]+\/[^@]+|[^@]+)@[^\s]+$/u.test(dependency),
      ),
    ).toBe(true);
    expect(fs.existsSync(path.join(packageRoot, 'registry/page-ui'))).toBe(
      false,
    );
  });

  it('exposes reusable file components without an automatic route', () => {
    const index = read('registry/component-ui/index.ts');
    const upload = read(
      'registry/component-ui/components/file-upload-field.tsx',
    );
    const preview = read(
      'registry/component-ui/components/file-preview-dialog.tsx',
    );
    const previewContent = read(
      'registry/component-ui/components/previewers/file-preview-content.tsx',
    );
    const urls = read('registry/component-ui/lib/file-url.ts');

    expect(index).toContain("'./components/file-upload-field'");
    expect(index).toContain("'./components/file-preview-field'");
    expect(index).toContain("'@nocobase/app-plugin-file/client'");
    expect(upload).toContain('onStatusChange');
    expect(upload).toContain("statusChangeRef.current?.('idle')");
    expect(upload).toContain('AbortController');
    expect(upload).toContain('completedRecordsRef');
    expect(upload).toContain('labels?.remove');
    expect(upload).toContain('labels?.retry');
    expect(upload).toMatch(/Retry[\s\S]+disabled=\{disabled\}/u);
    expect(upload).toContain('File removal failed.');
    expect(upload).toContain('onError?.');
    expect(upload).toMatch(/value\.map\(\(record\)/u);
    expect(upload).toContain("value === '*' || value === '*/*'");
    expect(preview).toContain("'@/components/ui/dialog'");
    expect(preview).toMatch(/files[\s\S]+initialIndex/u);
    expect(preview).toContain('signal: controller.signal');
    expect(preview).toContain('fileUrlCredentials(url)');
    expect(preview).toContain('reportDownloadError(onError, error)');
    expect(preview).toContain('resolveFilePreviewKind(file)');
    expect(previewContent).toMatch(/onDownload\s*\?/u);
    expect(previewContent).toContain('ReactMarkdown');
    expect(previewContent).toContain('remarkGfm');
    expect(previewContent).toContain('resolveOfficeEmbedUrl');
    expect(previewContent).toContain('OFFICE_PREVIEW_TIMEOUT_MS');
    expect(previewContent).toContain("target='_blank'");
    expect(previewContent).toContain("rel='noreferrer'");
    expect(urls).toContain("resolved.protocol === 'http:'");
    expect(urls).toContain("resolved.protocol === 'https:'");
    expect(
      read('registry/component-ui/components/file-thumbnail.tsx'),
    ).toContain('isSafeImagePreview');
    expect(
      fs.existsSync(
        path.join(packageRoot, 'registry/component-ui/extension.ts'),
      ),
    ).toBe(false);
  });

  it('keeps relative imports inside the component item root', () => {
    const [item] = config.items;
    if (!item) throw new Error('The component Registry item is missing.');
    const root = path.resolve(packageRoot, item.source.root);
    for (const relativeFile of sourceFiles(item)) {
      const source = read(relativeFile);
      for (const match of source.matchAll(
        /(?:from\s+|import\s*\(\s*)['"](\.[^'"]+)['"]/gu,
      )) {
        const resolved = path.resolve(
          path.dirname(path.join(packageRoot, relativeFile)),
          match[1],
        );
        expect(path.relative(root, resolved).startsWith('..')).toBe(false);
      }
    }
  });

  it('contains no server, security, storage, or route implementation', () => {
    const source = config.items
      .flatMap((item) => filesUnder(item.source.root))
      .map(read)
      .join('\n');
    for (const banned of [
      'createFileRoute',
      'DatabaseManager',
      'NocoBaseDriveManager',
      'tokenSecret',
      'HMAC',
      'storages:',
      'storageKey',
      'sessionSecret',
      '@nocobase/app-plugin-file/server',
      'routeComponentOverrides',
    ]) {
      expect(source).not.toContain(banned);
    }
  });

  it('builds and materializes only the component item', () => {
    const temporaryRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'nocobase-file-registry-'),
    );
    try {
      execFileSync(
        process.execPath,
        [
          path.join(repoRoot, 'scripts/registry.mjs'),
          'build',
          '--package',
          packageRoot,
        ],
        { cwd: repoRoot },
      );
      const built = JSON.parse(read('public/r/component-ui.json')) as {
        readonly files: readonly {
          readonly path: string;
          readonly target: string;
        }[];
      };
      expect(built.files).toHaveLength(
        filesUnder('registry/component-ui').length,
      );
      expect(
        fs.existsSync(path.join(packageRoot, 'public/r/page-ui.json')),
      ).toBe(false);

      execFileSync(
        process.execPath,
        [
          path.join(repoRoot, 'scripts/registry.mjs'),
          'materialize',
          '--package',
          packageRoot,
          '--output-root',
          temporaryRoot,
        ],
        { cwd: repoRoot },
      );
      expect(
        fs.existsSync(
          path.join(
            temporaryRoot,
            'client/extensions/nocobase-file-component-ui/index.ts',
          ),
        ),
      ).toBe(true);
      expect(
        fs.existsSync(
          path.join(temporaryRoot, 'client/extensions/nocobase-file-page-ui'),
        ),
      ).toBe(false);
    } finally {
      fs.rmSync(temporaryRoot, { force: true, recursive: true });
    }
  });

  it('resolves the component item from a local HTTP Registry', async () => {
    const consumerRoot = path.join(
      repoRoot,
      'packages/templates/app-template-default',
    );
    const requests: string[] = [];
    const server = createServer((request, response) => {
      requests.push(request.url ?? '');
      const name = request.url?.split('/').pop() ?? '';
      const file = path.join(packageRoot, 'public/r', name);
      if (!fs.existsSync(file)) {
        response.statusCode = 404;
        response.end('not found');
        return;
      }
      response.setHeader('content-type', 'application/json');
      response.end(fs.readFileSync(file));
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Local Registry server did not bind to a TCP port.');
    }
    try {
      let output: string;
      try {
        ({ stdout: output } = await execFileAsync(
          'pnpm',
          [
            '--dir',
            packageRoot,
            'exec',
            'shadcn',
            'add',
            `http://127.0.0.1:${address.port}/component-ui.json`,
            '--dry-run',
            '-y',
            '--cwd',
            consumerRoot,
          ],
          { cwd: repoRoot, encoding: 'utf8' },
        ));
      } catch (error) {
        const stderr = Reflect.get(error as object, 'stderr');
        const stdout = Reflect.get(error as object, 'stdout');
        throw new Error(
          typeof stderr === 'string' && stderr
            ? stderr
            : typeof stdout === 'string' && stdout
              ? stdout
              : 'Unable to resolve component-ui.',
          { cause: error },
        );
      }
      expect(output).not.toContain('Error:');
      expect(requests).toEqual(expect.arrayContaining(['/component-ui.json']));
      expect(requests).not.toContain('/page-ui.json');
    } finally {
      server.close();
      await once(server, 'close');
    }
  }, 30_000);
});
