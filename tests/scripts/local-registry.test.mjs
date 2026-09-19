import assert from 'node:assert/strict';
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
