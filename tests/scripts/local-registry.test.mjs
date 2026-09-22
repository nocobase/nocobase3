import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  parseArgs,
  assertWorkdir,
  registryEnv,
} from '../../scripts/local-registry.mjs';
import {
  mergeMainConfig,
  readMainConfig,
} from '../../scripts/local-registry-config.mjs';

test('local registry arguments select templates and reject incomplete database configuration', () => {
  assert.equal(parseArgs(['verify']).template, 'default');
  assert.equal(parseArgs(['verify', '--template', 'hub']).template, 'hub');
  assert.equal(parseArgs(['prepare', '--port', '4874']).port, 4874);
  assert.equal(
    parseArgs(['verify', '--dialect', 'postgres', '--config', '/tmp/test.yml'])
      .dialect,
    'postgres',
  );
  for (const args of [
    ['verify', '--template', 'bad'],
    ['verify', '--dialect', 'postgres'],
    ['prepare', '--port', '65536'],
    ['verify', '--timeout', '0'],
    ['stop', '--port', '4873'],
  ])
    assert.throws(() => parseArgs(args));
});

test('registry environment overrides npm and pnpm without changing the process environment', () => {
  const original = process.env.NPM_CONFIG_REGISTRY;
  const env = registryEnv({
    registry: 'http://127.0.0.1:4873/',
    npmrc: '/tmp/local.npmrc',
  });
  assert.equal(env.NPM_CONFIG_REGISTRY, env.PNPM_CONFIG_REGISTRY);
  assert.equal(env.NPM_CONFIG_USERCONFIG, '/tmp/local.npmrc');
  assert.equal(process.env.NPM_CONFIG_REGISTRY, original);
});

test('workdir validation refuses existing files and repository descendants', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'local-registry-test-'));
  try {
    const repo = path.join(root, 'repo');
    fs.mkdirSync(repo);
    assert.throws(() => assertWorkdir(repo, repo), /outside/);
    const work = assertWorkdir(path.join(root, 'work'), repo);
    fs.writeFileSync(path.join(work, 'keep'), 'important');
    assert.throws(() => assertWorkdir(work, repo), /empty/);
    assert.equal(fs.readFileSync(path.join(work, 'keep'), 'utf8'), 'important');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('database config merge preserves generated secrets and other connections', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'local-registry-config-'));
  try {
    const source = path.join(root, 'source.yml');
    const target = path.join(root, 'config.yml');
    fs.writeFileSync(
      source,
      'auth:\n  secret: ignored\ndatabase:\n  connections:\n    main:\n      dialect: postgres\n      host: test-db\n      password: test-password\n',
    );
    fs.writeFileSync(
      target,
      'auth:\n  secret: generated-secret\ndatabase:\n  connections:\n    main:\n      dialect: postgres\n      migrations:\n        autoRun: true\n    analytics:\n      dialect: sqlite\n',
    );
    assert.throws(() => readMainConfig(source, 'mysql'), /selected dialect/);
    mergeMainConfig(target, source, 'postgres');
    const result = fs.readFileSync(target, 'utf8');
    assert.match(result, /generated-secret/);
    assert.doesNotMatch(result, /ignored/);
    assert.match(result, /test-db/);
    assert.match(result, /analytics/);
    assert.match(result, /autoRun: true/);
    assert.equal(fs.statSync(target).mode & 0o777, 0o600);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('npm and pnpm resolve the isolated scope registry instead of user configuration', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'local-registry-env-'));
  try {
    const npmrc = path.join(root, 'npmrc');
    const registry = 'http://127.0.0.1:4873/';
    fs.writeFileSync(
      npmrc,
      `registry=${registry}\n@nocobase:registry=${registry}\n`,
    );
    const env = registryEnv({ npmrc, registry });
    for (const tool of ['npm', 'pnpm']) {
      for (const key of ['registry', '@nocobase:registry']) {
        const result = spawnSync(tool, ['config', 'get', key], {
          env,
          encoding: 'utf8',
        });
        assert.equal(result.status, 0, result.stderr);
        assert.equal(result.stdout.trim(), registry);
      }
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('create accepts a name and creation options without requiring database credentials', () => {
  const options = parseArgs([
    'create',
    'crm',
    '--template',
    'hub',
    '--dialect',
    'postgres',
    '--json',
    '--no-install',
    '--output-dir',
    '/tmp/apps',
  ]);
  assert.equal(options.name, 'crm');
  assert.equal(options.template, 'hub');
  assert.equal(options.dialect, 'postgres');
  assert.equal(options.json, true);
  assert.equal(options['no-install'], true);
  assert.equal(options['output-dir'], '/tmp/apps');
  for (const args of [
    ['create'],
    ['create', '../crm'],
    ['create', 'crm', 'other'],
    ['create', 'crm', '--registry', 'http://example.com'],
  ])
    assert.throws(() => parseArgs(args));
});

test('reset is a boolean option exclusive to prepare', () => {
  assert.equal(parseArgs(['prepare']).reset, undefined);
  assert.equal(parseArgs(['prepare', '--reset', '--port', '4874']).reset, true);
  assert.equal(parseArgs(['prepare', '--port', '4874', '--reset']).port, 4874);
  for (const args of [
    ['stop', '--reset'],
    ['verify', '--reset'],
    ['create', 'crm', '--reset'],
    ['prepare', '--reset', 'false'],
  ])
    assert.throws(() => parseArgs(args), /Invalid option/);
});

for (const scenario of [
  'existing',
  'reset',
  'fresh',
  'foreign',
  'remove-fails',
  'locked',
]) {
  test(`prepare reset lifecycle: ${scenario}`, () => {
    const root = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'registry-reset-')),
    );
    const repo = path.join(root, 'repo');
    fs.mkdirSync(path.join(repo, 'scripts'), { recursive: true });
    // Use a separate checkout identity so tests cannot touch a developer's session.
    const script = fs
      .readFileSync(
        new URL('../../scripts/local-registry.mjs', import.meta.url),
        'utf8',
      )
      .replace(
        "'./smoke-registry-config.mjs'",
        JSON.stringify(
          new URL('../../scripts/smoke-registry-config.mjs', import.meta.url)
            .href,
        ),
      )
      .replace(
        "'./local-registry-config.mjs'",
        JSON.stringify(
          new URL('../../scripts/local-registry-config.mjs', import.meta.url)
            .href,
        ),
      );
    fs.writeFileSync(path.join(repo, 'scripts/local-registry.mjs'), script);
    const id = createHash('sha256').update(repo).digest('hex').slice(0, 12);
    const stateDir = path.join(os.tmpdir(), `nocobase-local-registry-${id}`);
    const stateFile = path.join(stateDir, 'state.json');
    const container = `nocobase-local-registry-${id}`;
    fs.mkdirSync(stateDir, { recursive: true });
    const state = {
      repo,
      container,
      registry: 'http://127.0.0.1:4873/',
      ready: true,
    };
    if (scenario !== 'fresh')
      fs.writeFileSync(stateFile, JSON.stringify(state));
    fs.writeFileSync(path.join(stateDir, 'old-cache'), 'old snapshot');
    if (scenario === 'locked')
      fs.writeFileSync(path.join(stateDir, 'lock'), String(process.pid));
    fs.mkdirSync(path.join(repo, 'packages/libs/fixture'), { recursive: true });
    fs.writeFileSync(
      path.join(repo, 'packages/libs/fixture/package.json'),
      JSON.stringify({ name: '@test/fixture', version: '1.0.0' }),
    );
    fs.mkdirSync(path.join(repo, '.github/verdaccio'), { recursive: true });
    fs.writeFileSync(
      path.join(repo, '.github/verdaccio/config.yaml'),
      'packages:\n',
    );
    const log = path.join(root, 'docker.jsonl');
    fs.writeFileSync(
      path.join(root, 'docker'),
      `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify({ args, locked: fs.existsSync(${JSON.stringify(path.join(stateDir, 'lock'))}) }) + '\\n');
if (args[0] === 'ps') console.log(${JSON.stringify(container)});
if (args[0] === 'inspect') console.log(${JSON.stringify(scenario === 'foreign' ? 'another-checkout' : id)});
if (args[0] === 'rm' && ${JSON.stringify(scenario)} === 'remove-fails') process.exit(1);
// End the fixture at startup; no real Docker daemon, build, or publish is used.
if (args[0] === 'run') process.exit(23);
`,
      { mode: 0o755 },
    );
    try {
      const result = spawnSync(
        process.execPath,
        [
          path.join(repo, 'scripts/local-registry.mjs'),
          'prepare',
          ...(scenario === 'existing' ? [] : ['--reset']),
          '--port',
          '4874',
        ],
        {
          encoding: 'utf8',
          env: {
            ...process.env,
            PATH: `${root}${path.delimiter}${process.env.PATH}`,
          },
        },
      );
      assert.equal(result.status, 1, result.stderr);
      const calls = fs.existsSync(log)
        ? fs
            .readFileSync(log, 'utf8')
            .trim()
            .split('\n')
            .map((line) => JSON.parse(line))
        : [];
      const commands = calls.map(({ args }) => args[0]);
      assert.ok(
        calls.every(({ locked }) => locked),
        'cleanup and startup must retain the operation lock',
      );
      if (scenario === 'reset' || scenario === 'fresh') {
        assert.deepEqual(
          commands,
          scenario === 'reset' ? ['ps', 'inspect', 'rm', 'run'] : ['run'],
        );
        assert.match(result.stderr, /docker run failed.*23/);
        assert.equal(fs.existsSync(path.join(stateDir, 'old-cache')), false);
        assert.equal(
          JSON.parse(fs.readFileSync(stateFile, 'utf8')).registry,
          'http://127.0.0.1:4874/',
        );
      } else {
        assert.deepEqual(
          commands,
          scenario === 'foreign'
            ? ['ps', 'inspect']
            : scenario === 'remove-fails'
              ? ['ps', 'inspect', 'rm']
              : [],
        );
        assert.deepEqual(JSON.parse(fs.readFileSync(stateFile, 'utf8')), state);
        assert.equal(
          fs.readFileSync(path.join(stateDir, 'old-cache'), 'utf8'),
          'old snapshot',
        );
        assert.match(
          result.stderr,
          scenario === 'existing'
            ? /session already exists/
            : scenario === 'foreign'
              ? /not owned/
              : scenario === 'locked'
                ? /operation is running/
                : /docker rm failed/,
        );
      }
      assert.equal(
        fs.existsSync(path.join(stateDir, 'lock')),
        scenario === 'locked',
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(stateDir, { recursive: true, force: true });
    }
  });
}
