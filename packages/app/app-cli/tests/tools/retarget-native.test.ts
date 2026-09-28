// @vitest-environment node

import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

const temporaryDirectories: string[] = [];
const script = path.resolve(
  import.meta.dirname,
  '../../src/tools/scripts/utils/retarget-native.mjs',
);

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

interface Manifest {
  name: string;
  version: string;
  os?: string[];
  cpu?: string[];
  libc?: string[];
  scripts?: { install: string };
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'nocobase-retarget-'));
  temporaryDirectories.push(root);
  const modules = path.join(root, 'dist/node_modules');
  mkdirSync(modules, { recursive: true });
  writeFileSync(path.join(root, 'dist/package.json'), '{"name":"fixture"}');
  const callsPath = path.join(root, 'calls.jsonl');
  writeFileSync(callsPath, '');
  const shim = path.join(root, 'commands.mjs');
  // Intercept only subprocesses. Run the real scanner and retargeter without network access or host binaries.
  writeFileSync(
    shim,
    `import childProcess from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { syncBuiltinESMExports } from 'node:module';
const config = JSON.parse(process.env.RETARGET_FIXTURE);
childProcess.spawnSync = (command, args, options) => {
  fs.appendFileSync(${JSON.stringify(callsPath)}, JSON.stringify({ command, args }) + '\\n');
  const ok = { status: 0, stdout: '', stderr: '' };
  const fail = { status: 1, stdout: '', stderr: 'fixture download failure' };
  if (command === 'npm' && args[0] === 'view') {
    return config.failure === 'view' ? fail : { ...ok, stdout: JSON.stringify(config.versions) };
  }
  if (command === 'npm' && args[0] === 'pack') {
    if (config.failure === 'pack' || args[1] !== config.spec) return fail;
    if (config.failure !== 'missing-tarball') fs.writeFileSync(path.join(options.cwd, 'fixture.tgz'), 'fixture');
    return ok;
  }
  if (command === 'tar') {
    const directory = path.join(options.cwd, 'package');
    fs.mkdirSync(directory);
    fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify(config.manifest));
    for (const binary of config.binaries) fs.writeFileSync(path.join(directory, binary), binary);
    return config.failure === 'tar' ? fail : ok;
  }
  return fail;
};
syncBuiltinESMExports();`,
  );

  function install(manifest: Manifest, binaries: string[] = []) {
    const directory = path.join(modules, manifest.name);
    mkdirSync(directory, { recursive: true });
    writeFileSync(
      path.join(directory, 'package.json'),
      JSON.stringify(manifest),
    );
    for (const binary of binaries) {
      writeFileSync(path.join(directory, binary), binary);
    }
    return directory;
  }

  function run(
    target: string,
    download?: {
      manifest: Manifest;
      spec?: string;
      binaries?: string[];
      failure?: string;
      versions?: string[] | string;
    },
  ) {
    const result = spawnSync(
      process.execPath,
      ['--import', shim, script, '--target', target, '--node-version', '24'],
      {
        cwd: root,
        encoding: 'utf8',
        timeout: 10_000,
        env: {
          ...process.env,
          NOCOBASE_TOOL_ROOT: root,
          RETARGET_FIXTURE: JSON.stringify({
            ...download,
            spec:
              download?.spec ??
              (download &&
                `${download.manifest.name}@${download.manifest.version}`),
            binaries: download?.binaries ?? ['binding.node'],
          }),
        },
      },
    );
    const calls: { command: string; args: string[] }[] = readFileSync(
      callsPath,
      'utf8',
    )
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line: string) => JSON.parse(line));
    return { ...result, calls };
  }

  return { root, modules, install, run };
}

const msgpackrBase = '@msgpackr-extract/msgpackr-extract';
const msgpackrOwner: Manifest = {
  name: 'msgpackr-extract',
  version: '3.0.4',
  scripts: { install: 'node-gyp-build-optional-packages' },
  dependencies: { 'node-gyp-build-optional-packages': '5.2.2' },
  optionalDependencies: {
    [`${msgpackrBase}-linux-x64`]: '3.0.4',
    [`${msgpackrBase}-linux-arm64`]: '3.0.4',
    [`${msgpackrBase}-win32-x64`]: '3.0.4',
  },
};

function platformManifest(
  name: string,
  cpu: string,
  osName = 'linux',
): Manifest {
  return { name, version: '3.0.4', cpu: [cpu], os: [osName] };
}

describe('platform-package retargeting', () => {
  it.each(['linux-arm64', 'linux-arm64-musl'])(
    'uses the declared unsuffixed msgpackr package for %s and does not rebuild its loader',
    (target) => {
      const f = fixture();
      f.install(msgpackrOwner);
      const old = f.install(
        platformManifest(`${msgpackrBase}-linux-x64`, 'x64'),
        ['node.napi.glibc.node', 'node.napi.musl.node'],
      );
      const manifest = platformManifest(`${msgpackrBase}-linux-arm64`, 'arm64');
      const binaries = ['node.napi.glibc.node', 'node.napi.musl.node'];
      const result = f.run(target, { manifest, binaries });

      expect(result.stderr).toBe('');
      expect(result.status).toBe(0);
      expect(result.calls).toEqual([
        {
          command: 'npm',
          args: ['pack', `${manifest.name}@3.0.4`, '--silent'],
        },
        { command: 'tar', args: ['-xzf', 'fixture.tgz'] },
      ]);
      expect(existsSync(old)).toBe(false);
      for (const binary of binaries) {
        expect(existsSync(path.join(f.modules, manifest.name, binary))).toBe(
          true,
        );
      }
    },
  );

  it.each(['linux-x64', 'linux-x64-musl'])(
    'keeps a declared combined-libc package for %s without downloading or rebuilding',
    (target) => {
      const f = fixture();
      f.install(msgpackrOwner);
      const old = f.install(
        platformManifest(`${msgpackrBase}-linux-x64`, 'x64'),
        ['node.napi.glibc.node', 'node.napi.musl.node'],
      );
      const result = f.run(target);
      expect(result.stderr).toBe('');
      expect(result.status).toBe(0);
      expect(result.calls).toEqual([]);
      expect(existsSync(old)).toBe(true);
    },
  );

  it.each([
    ['standalone-linux-x64', 'linux-x64'],
    ['standalone-linux-x64', 'linux-x64-musl'],
    ['standalone-linux-x64-gnu', 'linux-x64'],
    ['standalone-linux-x64-musl', 'linux-x64-musl'],
    ['standalone', 'linux-x64'],
  ])(
    'keeps compatible ownerless %s for %s without fetching a sibling',
    (name, target) => {
      const f = fixture();
      const old = f.install(platformManifest(name, 'x64'), ['binding.node']);
      const result = f.run(target);
      expect(result.stderr).toBe('');
      expect(result.status).toBe(0);
      expect(result.calls).toEqual([]);
      expect(existsSync(path.join(old, 'binding.node'))).toBe(true);
    },
  );

  it.each([
    { name: 'standalone-linux-x64-gnu' },
    { libc: ['glibc'] },
    { libc: ['!musl'] },
    { name: 'standalone-linux-arm64-musl' },
    { cpu: ['arm64'] },
    { os: ['darwin'] },
  ])(
    'rejects ownerless target mismatches from manifest or name: %j',
    (override) => {
      const f = fixture();
      const old = f.install(
        { ...platformManifest('standalone-linux-x64', 'x64'), ...override },
        ['binding.node'],
      );
      const result = f.run('linux-x64-musl');
      expect(result.status).toBe(1);
      expect(result.calls).toEqual([]);
      expect(existsSync(path.join(old, 'binding.node'))).toBe(true);
    },
  );

  it.each([
    ['0.1.100', '^0.1.0'],
    ['^0.1.0', '0.1.100'],
  ])(
    'resolves compatible owner specs %s and %s to the exact version',
    (first, second) => {
      const f = fixture();
      const current = `${msgpackrBase}-linux-x64`;
      const wanted = `${msgpackrBase}-linux-arm64`;
      for (const [index, spec] of [first, second].entries()) {
        f.install({
          name: `owner-${index}`,
          version: '1.0.0',
          optionalDependencies: { [current]: '*', [wanted]: spec },
        });
      }
      f.install(platformManifest(current, 'x64'));
      const manifest = {
        ...platformManifest(wanted, 'arm64'),
        version: '0.1.100',
      };
      const result = f.run('linux-arm64', { manifest });
      expect(result.stderr).toBe('');
      expect(result.status).toBe(0);
      expect(result.calls).toEqual([
        { command: 'npm', args: ['pack', `${wanted}@0.1.100`, '--silent'] },
        { command: 'tar', args: ['-xzf', 'fixture.tgz'] },
      ]);
    },
  );

  it.each([
    { ranges: ['^0.1.0'] },
    { ranges: ['^0.1.0', '>=0.1.50 <0.2.0'] },
    { ranges: ['>=0.1.0 <0.1.200', '>=0.1.50 <0.2.0'] },
  ])(
    'keeps an installed version satisfying every owner range without downloading: %j',
    ({ ranges }) => {
      const f = fixture();
      const name = `${msgpackrBase}-linux-x64`;
      for (const [index, spec] of ranges.entries()) {
        f.install({
          name: `owner-${index}`,
          version: '1.0.0',
          optionalDependencies: { [name]: spec },
        });
      }
      const old = f.install(
        { ...platformManifest(name, 'x64'), version: '0.1.100' },
        ['binding.node'],
      );
      const result = f.run('linux-x64');
      expect(result.stderr).toBe('');
      expect(result.status).toBe(0);
      expect(result.calls).toEqual([]);
      expect(existsSync(path.join(old, 'binding.node'))).toBe(true);
    },
  );

  it.each(['^0.1.0', '0.1.x', '>=0.1.0 <0.2.0 || ^2.0.0'])(
    'validates a downloaded version against the owner range %s',
    (spec) => {
      const f = fixture();
      const current = `${msgpackrBase}-linux-x64`;
      const wanted = `${msgpackrBase}-linux-arm64`;
      f.install({
        name: 'owner',
        version: '1.0.0',
        optionalDependencies: { [current]: '*', [wanted]: spec },
      });
      const old = f.install(platformManifest(current, 'x64'));
      const result = f.run('linux-arm64', {
        spec: `${wanted}@${spec}`,
        manifest: { ...platformManifest(wanted, 'arm64'), version: '0.2.0' },
      });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('incompatible');
      expect(existsSync(old)).toBe(true);
    },
  );

  it.each([
    {
      versions: ['0.1.40', '0.1.75', '0.1.100', '0.2.0'],
      selected: '0.1.75',
      failure: undefined,
    },
    {
      versions: ['0.1.40', '0.1.100'],
      selected: undefined,
      failure: undefined,
    },
    { versions: '0.1.75', selected: '0.1.75', failure: undefined },
    { versions: ['0.1.75'], selected: undefined, failure: 'view' },
    { versions: undefined, selected: undefined, failure: undefined },
  ])(
    'resolves overlapping owner ranges using published versions: %j',
    ({ versions, selected, failure }) => {
      const f = fixture();
      const current = `${msgpackrBase}-linux-x64`;
      const wanted = `${msgpackrBase}-linux-arm64`;
      for (const [index, spec] of [
        '>=0.1.0 <0.1.100',
        '>=0.1.50 <0.2.0',
      ].entries()) {
        f.install({
          name: `owner-${index}`,
          version: '1.0.0',
          optionalDependencies: { [current]: '*', [wanted]: spec },
        });
      }
      const old = f.install(platformManifest(current, 'x64'));
      const result = f.run('linux-arm64', {
        versions,
        failure,
        manifest: {
          ...platformManifest(wanted, 'arm64'),
          version: selected ?? '0.1.75',
        },
      });
      expect(result.status).toBe(selected ? 0 : 1);
      expect(result.calls[0]).toEqual({
        command: 'npm',
        args: ['view', wanted, 'versions', '--json'],
      });
      if (selected) {
        expect(result.calls[1]?.args[1]).toBe(`${wanted}@${selected}`);
      } else {
        expect(result.calls).toHaveLength(1);
        expect(existsSync(old)).toBe(true);
      }
    },
  );

  it.each(['^0.2.0', '>=1.0.0', '0.1.100-beta.1'])(
    'rejects incompatible owner constraints ^0.1.0 and %s before fetching',
    (spec) => {
      const f = fixture();
      const current = `${msgpackrBase}-linux-x64`;
      const wanted = `${msgpackrBase}-linux-arm64`;
      for (const [index, range] of ['^0.1.0', spec].entries()) {
        f.install({
          name: `owner-${index}`,
          version: '1.0.0',
          optionalDependencies: { [current]: '*', [wanted]: range },
        });
      }
      const old = f.install(platformManifest(current, 'x64'));
      const result = f.run('linux-arm64');
      expect(result.status).toBe(1);
      expect(result.calls).toEqual([]);
      expect(existsSync(old)).toBe(true);
    },
  );

  it.each(['gnu', 'musl'])(
    'selects the declared napi %s package and its version, not the parent or installed sibling version',
    (libc) => {
      const f = fixture();
      const base = '@napi-rs/example';
      const manifest = {
        ...platformManifest(`${base}-linux-arm64-${libc}`, 'arm64'),
        version: '2.5.1',
        libc: [libc === 'gnu' ? 'glibc' : 'musl'],
      };
      f.install({
        name: base,
        version: '9.0.0',
        optionalDependencies: {
          [`${base}-linux-x64-gnu`]: '1.0.0',
          [`${base}-linux-arm64-gnu`]: '2.5.1',
          [`${base}-linux-arm64-musl`]: '2.5.1',
        },
      });
      f.install({
        ...platformManifest(`${base}-linux-x64-gnu`, 'x64'),
        version: '1.0.0',
      });
      const result = f.run(`linux-arm64-${libc}`, { manifest });
      expect(result.stderr).toBe('');
      expect(result.status).toBe(0);
      expect(result.calls[0]?.args).toEqual([
        'pack',
        `${manifest.name}@2.5.1`,
        '--silent',
      ]);
      expect(
        existsSync(path.join(f.modules, manifest.name, 'binding.node')),
      ).toBe(true);
    },
  );

  it('refreshes an already matching platform when the owner pins a different version', () => {
    const f = fixture();
    f.install(msgpackrOwner);
    const manifest = platformManifest(`${msgpackrBase}-linux-x64`, 'x64');
    f.install({ ...manifest, version: '3.0.0' }, ['binding.node']);
    const result = f.run('linux-x64', { manifest });
    expect(result.status).toBe(0);
    expect(result.calls[0]?.args[1]).toBe(`${manifest.name}@3.0.4`);
    expect(
      JSON.parse(
        readFileSync(
          path.join(f.modules, manifest.name, 'package.json'),
          'utf8',
        ),
      ),
    ).toEqual(manifest);
  });

  it('supports declared unsuffixed Windows packages', () => {
    const f = fixture();
    f.install(msgpackrOwner);
    f.install(platformManifest(`${msgpackrBase}-linux-x64`, 'x64'));
    const manifest = platformManifest(
      `${msgpackrBase}-win32-x64`,
      'x64',
      'win32',
    );
    const result = f.run('win32-x64', { manifest });
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(result.calls[0]?.args[1]).toBe(`${manifest.name}@3.0.4`);
  });

  it('fails instead of guessing an undeclared target package', () => {
    const f = fixture();
    f.install({
      ...msgpackrOwner,
      optionalDependencies: { [`${msgpackrBase}-linux-x64`]: '3.0.4' },
    });
    const old = f.install(platformManifest(`${msgpackrBase}-linux-x64`, 'x64'));
    const result = f.run('linux-arm64');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('no declared platform package');
    expect(result.calls).toEqual([]);
    expect(existsSync(old)).toBe(true);
  });

  it('does not substitute gnu for an unavailable musl package', () => {
    const f = fixture();
    const name = '@napi-rs/example-linux-x64-gnu';
    f.install({
      name: '@napi-rs/example',
      version: '1.0.0',
      optionalDependencies: { [name]: '3.0.4' },
    });
    f.install(platformManifest(name, 'x64'));
    const result = f.run('linux-x64-musl');
    expect(result.status).toBe(1);
    expect(result.calls).toEqual([]);
  });

  it('fails safely when no installed owner declares the package', () => {
    const f = fixture();
    const old = f.install(platformManifest('standalone-linux-x64', 'x64'));
    const result = f.run('linux-arm64');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('no declared platform package');
    expect(result.calls).toEqual([]);
    expect(existsSync(old)).toBe(true);
  });

  it.each(['pack', 'missing-tarball', 'tar'])(
    'reports a %s failure without removing the existing binary',
    (failure) => {
      const f = fixture();
      f.install(msgpackrOwner);
      const old = f.install(
        platformManifest(`${msgpackrBase}-linux-x64`, 'x64'),
        ['binding.node'],
      );
      const result = f.run('linux-arm64', {
        manifest: platformManifest(`${msgpackrBase}-linux-arm64`, 'arm64'),
        failure,
      });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain(
        '1 native module(s) could not be retargeted',
      );
      expect(existsSync(path.join(old, 'binding.node'))).toBe(true);
    },
  );

  it('rejects a downloaded package whose libc excludes the target', () => {
    const f = fixture();
    f.install(msgpackrOwner);
    const old = f.install(platformManifest(`${msgpackrBase}-linux-x64`, 'x64'));
    const manifest = {
      ...platformManifest(`${msgpackrBase}-linux-arm64`, 'arm64'),
      libc: ['glibc'],
    };
    const result = f.run('linux-arm64-musl', { manifest });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('incompatible');
    expect(existsSync(old)).toBe(true);
  });

  it.each([
    { name: 'unrelated-package' },
    { version: '99.0.0' },
    { cpu: ['x64'] },
    { os: ['darwin'] },
  ])('rejects an unexpected downloaded manifest: %j', (override) => {
    const f = fixture();
    f.install(msgpackrOwner);
    const old = f.install(platformManifest(`${msgpackrBase}-linux-x64`, 'x64'));
    const wanted = `${msgpackrBase}-linux-arm64`;
    const result = f.run('linux-arm64', {
      spec: `${wanted}@3.0.4`,
      manifest: { ...platformManifest(wanted, 'arm64'), ...override },
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('incompatible');
    expect(existsSync(old)).toBe(true);
  });

  it.each([
    {
      [`${msgpackrBase}-linux-x64`]: '3.0.4',
      [`${msgpackrBase}-linux-arm64`]: '4.0.0',
    },
    { [`${msgpackrBase}-linux-x64`]: '3.0.4' },
  ])(
    'rejects owners that cannot agree on a supported target: %j',
    (optionalDependencies) => {
      const f = fixture();
      f.install(msgpackrOwner);
      f.install({
        name: 'another-owner',
        version: '1.0.0',
        optionalDependencies,
      });
      f.install(platformManifest(`${msgpackrBase}-linux-x64`, 'x64'));
      const result = f.run('linux-arm64', {
        manifest: platformManifest(`${msgpackrBase}-linux-arm64`, 'arm64'),
      });
      expect(result.status).toBe(1);
      expect(result.calls).toEqual([]);
    },
  );

  it('does not silently skip an optional-package loader with no installed platform member', () => {
    const f = fixture();
    f.install(msgpackrOwner);
    const result = f.run('linux-arm64');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('no installed platform package');
    expect(result.calls).toEqual([]);
  });
});

describe('required native downloads', () => {
  it.each([
    'prebuild-install || node-gyp rebuild',
    'node-gyp rebuild',
    'node-gyp-build-optional-packages',
  ])(
    'keeps failure fatal for %s without a declared platform-package family',
    (install) => {
      const f = fixture();
      f.install(
        { name: 'required-driver', version: '1.0.0', scripts: { install } },
        ['binding.node'],
      );
      const result = f.run('linux-arm64-musl');
      expect(result.status).toBe(1);
      expect(result.calls).toEqual([
        {
          command: 'npx',
          args: [
            '--yes',
            'prebuild-install',
            '--platform',
            'linux',
            '--arch',
            'arm64',
            '--target',
            '24.0.0',
            '--libc',
            'musl',
          ],
        },
      ]);
      expect(result.stderr).toContain(
        '1 native module(s) could not be retargeted',
      );
    },
  );
});
