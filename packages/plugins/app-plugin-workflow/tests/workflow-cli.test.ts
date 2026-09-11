import { execFile } from 'node:child_process';
import fsPromises from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

import WorkflowBuild from '../cli/build.ts';
import WorkflowCheck from '../cli/check.ts';
import cliPlugin from '../cli/index.ts';
import packageMetadata from '../package.json' with { type: 'json' };

const execFileAsync = promisify(execFile);
const packageRoot = path.resolve(import.meta.dirname, '..');
const repoRoot = path.resolve(packageRoot, '../../..');
const appCli = path.join(
  repoRoot,
  'packages/templates/app-template-default/cli/index.ts',
);
const tsxLoader = path.join(packageRoot, 'node_modules/tsx/dist/loader.mjs');

describe('workflow CLI contribution', () => {
  it('declares the workflow topic and command map', () => {
    expect(cliPlugin).toMatchObject({
      packageName: packageMetadata.name,
      topic: 'workflow',
      commands: {
        check: WorkflowCheck,
        build: WorkflowBuild,
      },
    });
  });

  /**
   * The build stage reads the compiled `.js` a deployment runs, so it has to follow `tsc`. There is no dev
   * counterpart: outside production the loader compiles `server/workflows` on demand and produces the digest a build
   * would produce, so a preflight build would put seconds back on every `pnpm dev` start and reintroduce the
   * rebuild-and-restart loop it replaced, without making anything visible that is not already visible.
   */
  it('builds artifacts after the server build and never before a dev run', () => {
    expect(cliPlugin.buildHooks).toEqual({
      afterServerBuild: [
        {
          label: 'Build workflow artifacts',
          command: [
            'pnpm',
            'nocobase',
            'workflow',
            'build',
            '--resource-root',
            './dist/server/workflows',
          ],
        },
      ],
    });
    expect(cliPlugin.devHooks).toEqual({});
  });

  it('exposes the cli entry and shares the app oclif runtime', () => {
    expect(packageMetadata.exports['./cli']).toBeDefined();
    expect(packageMetadata.publishConfig.exports['./cli']).toBeDefined();
    // Declared once each. pnpm resolves both peers here on its own, so a duplicate devDependency adds nothing.
    expect(packageMetadata.peerDependencies['@nocobase/nb3-cli']).toBeTruthy();
    expect(packageMetadata.peerDependencies['@oclif/core']).toBeTruthy();
    expect(
      packageMetadata.devDependencies?.['@nocobase/nb3-cli'],
    ).toBeUndefined();
    expect(packageMetadata.devDependencies?.['@oclif/core']).toBeUndefined();
  });

  it('gives every command, flag, and argument help text', () => {
    for (const [name, command] of Object.entries(cliPlugin.commands)) {
      expect(command.summary, `${name} has no summary`).toBeTruthy();
      expect(
        command.examples?.length,
        `${name} has no example`,
      ).toBeGreaterThan(0);
      for (const [flag, definition] of Object.entries(command.flags ?? {})) {
        expect(
          definition.description ?? definition.summary,
          `${name} --${flag} has no description`,
        ).toBeTruthy();
      }
      for (const [argument, definition] of Object.entries(command.args ?? {})) {
        expect(
          definition.description,
          `${name} ${argument} has no description`,
        ).toBeTruthy();
      }
    }
  });

  it('checks a relative workflow path through the application CLI', async () => {
    const fixture = path.relative(
      packageRoot,
      path.join(
        packageRoot,
        'skill-evals/nocobase3-workflow-manage/fixtures/workflows/valid-quotation',
      ),
    );
    const { stdout } = await execFileAsync(
      process.execPath,
      ['--import', tsxLoader, appCli, 'workflow', 'check', fixture, '--json'],
      { cwd: packageRoot },
    );

    expect(JSON.parse(stdout)).toMatchObject({
      ok: true,
      status: 'success',
    });
  });

  it('builds application workflow artifacts with default paths', async () => {
    const root = await fsPromises.mkdtemp(
      path.join(os.tmpdir(), 'workflow-cli-build-'),
    );
    try {
      const packagePath = path.join(root, 'server/workflows/example');
      await fsPromises.mkdir(packagePath, { recursive: true });
      await fsPromises.writeFile(
        path.join(packagePath, 'workflow.ts'),
        `import { defineWorkflow } from ${JSON.stringify(path.join(packageRoot, 'index.ts'))};\nexport default defineWorkflow({ title: 'CLI build', nodes: [] });\n`,
      );
      await execFileAsync(
        process.execPath,
        ['--import', tsxLoader, appCli, 'workflow', 'build'],
        { cwd: root },
      );
      const keyRoot = path.join(root, 'dist/server/workflows/example');
      const [digest] = await fsPromises.readdir(keyRoot);
      await expect(
        fsPromises.readFile(
          path.join(keyRoot, digest, 'workflow.json'),
          'utf8',
        ),
      ).resolves.toContain('"title": "CLI build"');
    } finally {
      await fsPromises.rm(root, { recursive: true, force: true });
    }
  });
});
