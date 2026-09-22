import assert from 'node:assert/strict';
import {
  lstat,
  mkdir,
  mkdtemp,
  readlink,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  AGENT_SKILLS_DIRECTORY,
  CLAUDE_SKILLS_DIRECTORY,
  linkClaudeSkills,
} from '../../scripts/link-claude-skills.mjs';

test('links every committed skill with a relative target', async (t) => {
  const root = await createRepository(t, ['nocobase-alpha', 'nocobase-beta']);

  assert.deepEqual(await linkClaudeSkills(root), {
    linked: ['nocobase-alpha', 'nocobase-beta'],
    removed: [],
    skipped: [],
  });
  assert.equal(
    await readlink(path.join(root, CLAUDE_SKILLS_DIRECTORY, 'nocobase-alpha')),
    path.join('..', '..', AGENT_SKILLS_DIRECTORY, 'nocobase-alpha'),
  );
  assert.ok(
    (
      await lstat(path.join(root, CLAUDE_SKILLS_DIRECTORY, 'nocobase-beta'))
    ).isSymbolicLink(),
  );
});

test('mirrors a skill committed as a link to its package', async (t) => {
  const root = await createRepository(t, ['nocobase-alpha']);
  const packaged = path.join(root, 'packages', 'app', 'app-skills', 'skills');
  await mkdir(path.join(packaged, 'nocobase-deployment'), { recursive: true });
  await writeFile(
    path.join(packaged, 'nocobase-deployment', 'SKILL.md'),
    '# deployment\n',
  );
  await symlink(
    path.join(
      '..',
      '..',
      'packages',
      'app',
      'app-skills',
      'skills',
      'nocobase-deployment',
    ),
    path.join(root, AGENT_SKILLS_DIRECTORY, 'nocobase-deployment'),
    'dir',
  );
  await symlink(
    path.join('..', '..', 'packages', 'nowhere'),
    path.join(root, AGENT_SKILLS_DIRECTORY, 'nocobase-dangling'),
    'dir',
  );

  assert.deepEqual(await linkClaudeSkills(root), {
    linked: ['nocobase-alpha', 'nocobase-deployment'],
    removed: [],
    skipped: [],
  });
  assert.equal(
    await readlink(
      path.join(root, CLAUDE_SKILLS_DIRECTORY, 'nocobase-deployment'),
    ),
    path.join('..', '..', AGENT_SKILLS_DIRECTORY, 'nocobase-deployment'),
  );
  assert.ok(
    (
      await stat(
        path.join(
          root,
          CLAUDE_SKILLS_DIRECTORY,
          'nocobase-deployment',
          'SKILL.md',
        ),
      )
    ).isFile(),
  );
});

test('repeats without changing the result', async (t) => {
  const root = await createRepository(t, ['nocobase-alpha']);

  await linkClaudeSkills(root);
  assert.deepEqual(await linkClaudeSkills(root), {
    linked: ['nocobase-alpha'],
    removed: [],
    skipped: [],
  });
});

test('removes a link whose skill is gone', async (t) => {
  const root = await createRepository(t, ['nocobase-alpha']);
  await linkClaudeSkills(root);
  await rm(path.join(root, AGENT_SKILLS_DIRECTORY, 'nocobase-alpha'), {
    force: true,
    recursive: true,
  });

  assert.deepEqual(await linkClaudeSkills(root), {
    linked: [],
    removed: ['nocobase-alpha'],
    skipped: [],
  });
  await assert.rejects(
    lstat(path.join(root, CLAUDE_SKILLS_DIRECTORY, 'nocobase-alpha')),
    {
      code: 'ENOENT',
    },
  );
});

test('removes a link whose target is already missing', async (t) => {
  const root = await createRepository(t, []);
  await mkdir(path.join(root, CLAUDE_SKILLS_DIRECTORY), { recursive: true });
  await symlink(
    path.join('..', '..', AGENT_SKILLS_DIRECTORY, 'nocobase-gone'),
    path.join(root, CLAUDE_SKILLS_DIRECTORY, 'nocobase-gone'),
    'dir',
  );

  assert.deepEqual(await linkClaudeSkills(root), {
    linked: [],
    removed: ['nocobase-gone'],
    skipped: [],
  });
});

test('never replaces a real directory it did not write', async (t) => {
  const root = await createRepository(t, ['nocobase-alpha']);
  const occupied = path.join(root, CLAUDE_SKILLS_DIRECTORY, 'nocobase-alpha');
  await mkdir(occupied, { recursive: true });
  await writeFile(path.join(occupied, 'SKILL.md'), 'local\n');

  assert.deepEqual(await linkClaudeSkills(root), {
    linked: [],
    removed: [],
    skipped: ['nocobase-alpha'],
  });
  assert.ok((await lstat(occupied)).isDirectory());
});

test('leaves an unrelated local skill alone', async (t) => {
  const root = await createRepository(t, ['nocobase-alpha']);
  const local = path.join(root, CLAUDE_SKILLS_DIRECTORY, 'my-own-skill');
  await mkdir(local, { recursive: true });

  assert.deepEqual(await linkClaudeSkills(root), {
    linked: ['nocobase-alpha'],
    removed: [],
    skipped: [],
  });
  assert.ok((await lstat(local)).isDirectory());
});

test('does nothing when the repository has no skills', async (t) => {
  const root = await createRepository(t, []);

  assert.deepEqual(await linkClaudeSkills(root), {
    linked: [],
    removed: [],
    skipped: [],
  });
  await assert.rejects(lstat(path.join(root, CLAUDE_SKILLS_DIRECTORY)), {
    code: 'ENOENT',
  });
});

async function createRepository(t, skillNames) {
  const root = await mkdtemp(path.join(tmpdir(), 'link-claude-skills-'));
  t.after(() => rm(root, { force: true, recursive: true }));
  for (const name of skillNames) {
    const directory = path.join(root, AGENT_SKILLS_DIRECTORY, name);
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, 'SKILL.md'), `# ${name}\n`);
  }
  return root;
}
