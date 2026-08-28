import assert from 'node:assert/strict';
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  collectPluginSkills,
  formatSkillsSyncSummary,
  isOwnedSkillName,
  pluginSkillPrefix,
  resolveWorkspacePlugins,
  syncSkills,
  trySyncSkills,
} from '../../scripts/lib/skills-sync.mjs';
import { parseSyncSkillsArgs } from '../../scripts/sync-skills.mjs';

test('parses the application, plugin, and dry-run options', () => {
  assert.deepEqual(
    parseSyncSkillsArgs([
      '--app',
      '@nocobase/app-template-default',
      '--plugin',
      'workflow',
      '--dry-run',
    ]),
    {
      app: '@nocobase/app-template-default',
      dryRun: true,
      help: false,
      plugin: 'workflow',
    },
  );
  assert.deepEqual(parseSyncSkillsArgs([]), {
    app: 'app-template-default',
    dryRun: false,
    help: false,
    plugin: undefined,
  });
  assert.deepEqual(parseSyncSkillsArgs(['-h']).help, true);
  assert.throws(
    () => parseSyncSkillsArgs(['--app']),
    /--app requires a value/u,
  );
  assert.throws(() => parseSyncSkillsArgs(['--nope']), /Unknown option/u);
  assert.throws(
    () => parseSyncSkillsArgs(['workflow']),
    /Unexpected argument/u,
  );
});

test('derives the skill prefix from the plugin package name', () => {
  assert.equal(
    pluginSkillPrefix('@nocobase/app-plugin-workflow'),
    'nocobase-app-plugin-workflow',
  );
  assert.equal(
    isOwnedSkillName(
      'nocobase-app-plugin-workflow',
      'nocobase-app-plugin-workflow',
    ),
    true,
  );
  assert.equal(
    isOwnedSkillName(
      'nocobase-app-plugin-workflow',
      'nocobase-app-plugin-workflow-trigger',
    ),
    true,
  );
  assert.equal(
    isOwnedSkillName(
      'nocobase-app-plugin-workflow',
      'nocobase-app-plugin-workflows',
    ),
    false,
  );
  assert.throws(
    () => pluginSkillPrefix('app-plugin-workflow'),
    /must start with @nocobase\//u,
  );
});

test('copies plugin skills into the application', async (t) => {
  const repoRoot = await createTestRepo(t);
  await createPlugin(repoRoot, 'workflow', {
    'nocobase-app-plugin-workflow': {
      'SKILL.md': '# workflow\n',
      'references/usage.md': 'usage\n',
    },
    'nocobase-app-plugin-workflow-trigger': { 'SKILL.md': '# trigger\n' },
  });
  const appRoot = await createApp(repoRoot, {
    plugins: ['@nocobase/app-plugin-workflow'],
  });

  const result = await syncSkills({ repoRoot });

  assert.equal(result.dryRun, false);
  assert.deepEqual(
    result.copies.map(({ skillName }) => skillName),
    ['nocobase-app-plugin-workflow', 'nocobase-app-plugin-workflow-trigger'],
  );
  assert.equal(
    await readSkillFile(appRoot, 'nocobase-app-plugin-workflow', 'SKILL.md'),
    '# workflow\n',
  );
  assert.equal(
    await readSkillFile(
      appRoot,
      'nocobase-app-plugin-workflow',
      'references/usage.md',
    ),
    'usage\n',
  );
  assert.equal(
    await readSkillFile(
      appRoot,
      'nocobase-app-plugin-workflow-trigger',
      'SKILL.md',
    ),
    '# trigger\n',
  );
});

test('overwrites locally modified files and drops files deleted upstream', async (t) => {
  const repoRoot = await createTestRepo(t);
  await createPlugin(repoRoot, 'workflow', {
    'nocobase-app-plugin-workflow': { 'SKILL.md': '# upstream\n' },
  });
  const appRoot = await createApp(repoRoot, {
    plugins: ['@nocobase/app-plugin-workflow'],
  });
  await writeSkillFile(
    appRoot,
    'nocobase-app-plugin-workflow',
    'SKILL.md',
    '# edited locally\n',
  );
  await writeSkillFile(
    appRoot,
    'nocobase-app-plugin-workflow',
    'stale.md',
    'stale\n',
  );

  await syncSkills({ repoRoot });

  assert.equal(
    await readSkillFile(appRoot, 'nocobase-app-plugin-workflow', 'SKILL.md'),
    '# upstream\n',
  );
  assert.deepEqual(
    await readdir(
      path.join(appRoot, '.agents', 'skills', 'nocobase-app-plugin-workflow'),
    ),
    ['SKILL.md'],
  );
});

test('removes an application skill the plugin no longer provides', async (t) => {
  const repoRoot = await createTestRepo(t);
  await createPlugin(repoRoot, 'workflow', {
    'nocobase-app-plugin-workflow': { 'SKILL.md': '# workflow\n' },
  });
  const appRoot = await createApp(repoRoot, {
    plugins: ['@nocobase/app-plugin-workflow'],
  });
  await writeSkillFile(
    appRoot,
    'nocobase-app-plugin-workflow-trigger',
    'SKILL.md',
    '# removed\n',
  );

  const result = await syncSkills({ repoRoot });

  assert.deepEqual(
    result.removals.map(({ skillName }) => skillName),
    ['nocobase-app-plugin-workflow-trigger'],
  );
  assert.deepEqual(await readdir(path.join(appRoot, '.agents', 'skills')), [
    'nocobase-app-plugin-workflow',
  ]);
});

test('leaves application-authored directories untouched', async (t) => {
  const repoRoot = await createTestRepo(t);
  await createPlugin(repoRoot, 'workflow', {
    'nocobase-app-plugin-workflow': { 'SKILL.md': '# workflow\n' },
  });
  const appRoot = await createApp(repoRoot, {
    plugins: ['@nocobase/app-plugin-workflow'],
  });
  await writeSkillFile(appRoot, 'my-team-conventions', 'SKILL.md', '# mine\n');
  // A nocobase- directory that belongs to no registered plugin is not ours to delete either.
  await writeSkillFile(
    appRoot,
    'nocobase-app-plugin-audit-log',
    'SKILL.md',
    '# unregistered\n',
  );

  const result = await syncSkills({ repoRoot });

  assert.deepEqual(result.removals, []);
  assert.equal(
    await readSkillFile(appRoot, 'my-team-conventions', 'SKILL.md'),
    '# mine\n',
  );
  assert.equal(
    await readSkillFile(appRoot, 'nocobase-app-plugin-audit-log', 'SKILL.md'),
    '# unregistered\n',
  );
});

test('rejects a skill directory that does not match the plugin prefix', async (t) => {
  const repoRoot = await createTestRepo(t);
  await createPlugin(repoRoot, 'workflow', {
    'workflow-helper': { 'SKILL.md': '# bad\n' },
  });
  await createApp(repoRoot, { plugins: ['@nocobase/app-plugin-workflow'] });

  await assert.rejects(
    syncSkills({ repoRoot }),
    /Invalid skill directory workflow-helper.+must be named nocobase-app-plugin-workflow or nocobase-app-plugin-workflow-<suffix>/su,
  );
});

test('rejects a skill name provided by two plugins', async (t) => {
  const repoRoot = await createTestRepo(t);
  await createPlugin(repoRoot, 'notification', {
    'nocobase-app-plugin-notification-provider': {
      'SKILL.md': '# from notification\n',
    },
  });
  await createPlugin(repoRoot, 'notification-provider', {
    'nocobase-app-plugin-notification-provider': {
      'SKILL.md': '# from provider\n',
    },
  });
  await createApp(repoRoot, {
    plugins: [
      '@nocobase/app-plugin-notification',
      '@nocobase/app-plugin-notification-provider',
    ],
  });

  await assert.rejects(
    syncSkills({ repoRoot }),
    /Skill name collision: nocobase-app-plugin-notification-provider is provided by both @nocobase\/app-plugin-notification and @nocobase\/app-plugin-notification-provider/u,
  );
});

test('skips a plugin that ships no skills', async (t) => {
  const repoRoot = await createTestRepo(t);
  await createPlugin(repoRoot, 'data-provider');
  const appRoot = await createApp(repoRoot, {
    plugins: ['@nocobase/app-plugin-data-provider'],
  });

  const result = await syncSkills({ repoRoot });

  assert.deepEqual(result.copies, []);
  assert.deepEqual(result.removals, []);
  assert.equal(
    formatSkillsSyncSummary(result),
    'No plugin skills to synchronize for @nocobase/app-template-default.',
  );
  await assert.rejects(
    readdir(path.join(appRoot, '.agents', 'skills')),
    /ENOENT/u,
  );
});

test('dry-run reports the plan without writing', async (t) => {
  const repoRoot = await createTestRepo(t);
  await createPlugin(repoRoot, 'workflow', {
    'nocobase-app-plugin-workflow': { 'SKILL.md': '# workflow\n' },
  });
  const appRoot = await createApp(repoRoot, {
    plugins: ['@nocobase/app-plugin-workflow'],
  });
  await writeSkillFile(
    appRoot,
    'nocobase-app-plugin-workflow-trigger',
    'SKILL.md',
    '# removed\n',
  );

  const result = await syncSkills({ dryRun: true, repoRoot });
  const summary = formatSkillsSyncSummary(result);

  assert.equal(result.dryRun, true);
  assert.match(
    summary,
    /^Would synchronize plugin skills for @nocobase\/app-template-default$/mu,
  );
  assert.match(
    summary,
    /copy nocobase-app-plugin-workflow \(@nocobase\/app-plugin-workflow\)/u,
  );
  assert.match(summary, /\+ SKILL\.md/u);
  assert.match(summary, /remove nocobase-app-plugin-workflow-trigger/u);
  assert.deepEqual(await readdir(path.join(appRoot, '.agents', 'skills')), [
    'nocobase-app-plugin-workflow-trigger',
  ]);
});

test('--plugin limits the synchronization to one plugin', async (t) => {
  const repoRoot = await createTestRepo(t);
  await createPlugin(repoRoot, 'workflow', {
    'nocobase-app-plugin-workflow': { 'SKILL.md': '# workflow\n' },
  });
  await createPlugin(repoRoot, 'authorization', {
    'nocobase-app-plugin-authorization': { 'SKILL.md': '# authorization\n' },
  });
  const appRoot = await createApp(repoRoot, {
    plugins: [
      '@nocobase/app-plugin-workflow',
      '@nocobase/app-plugin-authorization',
    ],
  });

  const result = await syncSkills({ plugin: 'workflow', repoRoot });

  assert.deepEqual(
    result.copies.map(({ skillName }) => skillName),
    ['nocobase-app-plugin-workflow'],
  );
  assert.deepEqual(await readdir(path.join(appRoot, '.agents', 'skills')), [
    'nocobase-app-plugin-workflow',
  ]);
});

test('resolves registered plugins and their package directories', async (t) => {
  const repoRoot = await createTestRepo(t);
  await createPlugin(repoRoot, 'workflow');
  await createApp(repoRoot, { plugins: ['@nocobase/app-plugin-workflow'] });

  const resolved = await resolveWorkspacePlugins({ repoRoot });

  assert.equal(resolved.appPackageName, '@nocobase/app-template-default');
  assert.deepEqual(resolved.plugins, [
    {
      packageName: '@nocobase/app-plugin-workflow',
      pluginDirectory: path.join(repoRoot, 'packages', 'app-plugin-workflow'),
    },
  ]);
});

test('reports a missing plugin package with an actionable message', async (t) => {
  const repoRoot = await createTestRepo(t);
  await createApp(repoRoot, { plugins: ['@nocobase/app-plugin-ghost'] });

  await assert.rejects(
    syncSkills({ repoRoot }),
    /Plugin package @nocobase\/app-plugin-ghost was not found under .+packages/u,
  );
});

test('collectPluginSkills returns an empty list without .agents/skills', async (t) => {
  const repoRoot = await createTestRepo(t);
  await createPlugin(repoRoot, 'workflow');

  const collected = await collectPluginSkills({
    packageName: '@nocobase/app-plugin-workflow',
    pluginDirectory: path.join(repoRoot, 'packages', 'app-plugin-workflow'),
  });

  assert.deepEqual(collected.skills, []);
  assert.equal(collected.prefix, 'nocobase-app-plugin-workflow');
});

test('trySyncSkills downgrades failures to a warning', async (t) => {
  const repoRoot = await createTestRepo(t);
  await createPlugin(repoRoot, 'workflow', {
    'workflow-helper': { 'SKILL.md': '# bad\n' },
  });
  await createApp(repoRoot, { plugins: ['@nocobase/app-plugin-workflow'] });

  const warnings = [];
  const outcome = await trySyncSkills({
    onWarning: (message) => warnings.push(message),
    repoRoot,
  });

  assert.equal(outcome.succeeded, false);
  assert.equal(outcome.result, undefined);
  assert.match(
    outcome.warning,
    /^Skipped plugin skills synchronization: Invalid skill directory/u,
  );
  assert.deepEqual(warnings, [outcome.warning]);
});

test('trySyncSkills reports the result when the synchronization succeeds', async (t) => {
  const repoRoot = await createTestRepo(t);
  await createPlugin(repoRoot, 'workflow', {
    'nocobase-app-plugin-workflow': { 'SKILL.md': '# workflow\n' },
  });
  await createApp(repoRoot, { plugins: ['@nocobase/app-plugin-workflow'] });

  const warnings = [];
  const outcome = await trySyncSkills({
    onWarning: (message) => warnings.push(message),
    repoRoot,
  });

  assert.equal(outcome.succeeded, true);
  assert.equal(outcome.warning, undefined);
  assert.equal(outcome.result.copies.length, 1);
  assert.deepEqual(warnings, []);
});

async function createTestRepo(t) {
  const repoRoot = await mkdtemp(path.join(tmpdir(), 'nocobase-skills-sync-'));
  await mkdir(path.join(repoRoot, 'packages'), { recursive: true });
  t.after(() => rm(repoRoot, { force: true, recursive: true }));
  return repoRoot;
}

async function createPlugin(repoRoot, shortName, skills = {}) {
  const pluginDirectory = path.join(
    repoRoot,
    'packages',
    `app-plugin-${shortName}`,
  );
  await mkdir(pluginDirectory, { recursive: true });
  await writeJson(path.join(pluginDirectory, 'package.json'), {
    name: `@nocobase/app-plugin-${shortName}`,
  });
  for (const [skillName, files] of Object.entries(skills)) {
    for (const [relativePath, contents] of Object.entries(files)) {
      await writeFileAt(
        path.join(
          pluginDirectory,
          '.agents',
          'skills',
          skillName,
          relativePath,
        ),
        contents,
      );
    }
  }
  return pluginDirectory;
}

async function createApp(
  repoRoot,
  {
    directoryName = 'app-template-default',
    packageName = '@nocobase/app-template-default',
    plugins = [],
  } = {},
) {
  const appRoot = path.join(repoRoot, 'packages', directoryName);
  await mkdir(appRoot, { recursive: true });
  await writeJson(path.join(appRoot, 'package.json'), {
    name: packageName,
    nocobase: {
      plugins: Object.fromEntries(
        plugins.map((plugin) => [plugin, { enabled: true }]),
      ),
    },
  });
  return appRoot;
}

function readSkillFile(appRoot, skillName, relativePath) {
  return readFile(
    path.join(appRoot, '.agents', 'skills', skillName, relativePath),
    'utf8',
  );
}

function writeSkillFile(appRoot, skillName, relativePath, contents) {
  return writeFileAt(
    path.join(appRoot, '.agents', 'skills', skillName, relativePath),
    contents,
  );
}

async function writeFileAt(file, contents) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, contents);
}

async function writeJson(file, value) {
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}
