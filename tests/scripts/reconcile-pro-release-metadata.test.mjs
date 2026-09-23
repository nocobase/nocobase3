import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const implementation = path.resolve(
  import.meta.dirname,
  '../../scripts/reconcile-pro-release-metadata.mjs',
);

function git(cwd, args) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, GIT_ALLOW_PROTOCOL: 'file' },
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function write(root, relative, content) {
  const file = path.join(root, relative);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content);
}

function commit(cwd, message) {
  git(cwd, ['add', '--all']);
  git(cwd, ['commit', '-m', message]);
  return git(cwd, ['rev-parse', 'HEAD']);
}

function configure(cwd) {
  git(cwd, ['config', 'user.name', 'Release Test']);
  git(cwd, ['config', 'user.email', 'release@example.test']);
}

test('reconciles diverged Pro gitlink, catalog, Skill, and lock metadata before business conflicts', () => {
  const fixture = mkdtempSync(path.join(os.tmpdir(), 'pro-release-metadata-'));
  const oss = path.join(fixture, 'oss');
  const pro = path.join(fixture, 'pro');

  try {
    mkdirSync(oss);
    git(oss, ['init', '-b', 'develop']);
    configure(oss);
    write(oss, 'package.json', '{"name":"oss"}\n');
    write(oss, 'pnpm-workspace.yaml', 'catalog: develop\n');
    write(oss, 'skills/nocobase-plugin-development/SKILL.md', 'develop\n');
    const ossDevelop = commit(oss, 'oss develop');

    git(oss, ['checkout', '-b', 'stable-old']);
    write(oss, 'pnpm-workspace.yaml', 'catalog: stable-old\n');
    write(oss, 'skills/nocobase-plugin-development/SKILL.md', 'stable-old\n');
    const ossStableOld = commit(oss, 'oss stable old');

    git(oss, ['checkout', '-b', 'main', ossDevelop]);
    write(oss, 'pnpm-workspace.yaml', 'catalog: promoted-main\n');
    write(
      oss,
      'skills/nocobase-plugin-development/SKILL.md',
      'promoted-main\n',
    );
    const ossMain = commit(oss, 'oss promoted main');

    mkdirSync(pro);
    git(pro, ['init', '-b', 'develop']);
    configure(pro);
    write(pro, 'package.json', '{"type":"module"}\n');
    write(
      pro,
      'scripts/sync-workspace-config.mjs',
      "import fs from 'node:fs'; fs.copyFileSync('vendor/nocobase3/pnpm-workspace.yaml', 'pnpm-workspace.yaml');\n",
    );
    write(
      pro,
      'scripts/sync-development-skills.mjs',
      "import fs from 'node:fs'; fs.mkdirSync('skills/nocobase-plugin-development', { recursive: true }); fs.copyFileSync('vendor/nocobase3/skills/nocobase-plugin-development/SKILL.md', 'skills/nocobase-plugin-development/SKILL.md');\n",
    );
    git(pro, [
      '-c',
      'protocol.file.allow=always',
      'submodule',
      'add',
      oss,
      'vendor/nocobase3',
    ]);
    git(path.join(pro, 'vendor/nocobase3'), ['checkout', ossDevelop]);
    write(pro, 'pnpm-workspace.yaml', 'catalog: develop\n');
    write(pro, 'pnpm-lock.yaml', 'lock: develop\n');
    write(pro, 'skills/nocobase-plugin-development/SKILL.md', 'develop\n');
    commit(pro, 'pro develop');

    git(pro, ['checkout', '-b', 'main']);
    git(path.join(pro, 'vendor/nocobase3'), ['checkout', ossStableOld]);
    write(pro, 'pnpm-workspace.yaml', 'catalog: stable-old\n');
    write(pro, 'pnpm-lock.yaml', 'lock: stable-old\n');
    write(pro, 'skills/nocobase-plugin-development/SKILL.md', 'stable-old\n');
    commit(pro, 'pro stable old');

    git(pro, ['checkout', 'develop']);
    git(pro, ['checkout', '-b', 'promotion']);
    git(path.join(pro, 'vendor/nocobase3'), ['checkout', ossMain]);
    write(pro, 'pnpm-workspace.yaml', 'catalog: promoted-main\n');
    write(pro, 'pnpm-lock.yaml', 'lock: promotion-candidate\n');
    write(
      pro,
      'skills/nocobase-plugin-development/SKILL.md',
      'promoted-main\n',
    );
    const candidate = commit(pro, 'promotion candidate');

    const merge = spawnSync(
      'git',
      ['merge', '--no-ff', '--no-commit', 'main'],
      {
        cwd: pro,
        encoding: 'utf8',
        env: { ...process.env, GIT_ALLOW_PROTOCOL: 'file' },
      },
    );
    assert.notEqual(
      merge.status,
      0,
      'the fixture must produce generated metadata conflicts',
    );

    const result = spawnSync(
      process.execPath,
      [implementation, '--metadata-source', candidate, '--oss-sha', ossMain],
      {
        cwd: pro,
        encoding: 'utf8',
        env: { ...process.env, GIT_ALLOW_PROTOCOL: 'file' },
      },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.equal(git(pro, ['diff', '--name-only', '--diff-filter=U']), '');
    assert.equal(
      git(pro, ['-C', 'vendor/nocobase3', 'rev-parse', 'HEAD']),
      ossMain,
    );
    assert.match(
      git(pro, ['ls-files', '--stage', 'vendor/nocobase3']),
      new RegExp(ossMain, 'u'),
    );
    assert.equal(
      readFileSync(path.join(pro, 'pnpm-workspace.yaml'), 'utf8'),
      'catalog: promoted-main\n',
    );
    assert.equal(
      readFileSync(path.join(pro, 'pnpm-lock.yaml'), 'utf8'),
      'lock: promotion-candidate\n',
    );
    assert.equal(
      readFileSync(
        path.join(pro, 'skills/nocobase-plugin-development/SKILL.md'),
        'utf8',
      ),
      'promoted-main\n',
    );
  } finally {
    rmSync(fixture, { force: true, recursive: true });
  }
});
