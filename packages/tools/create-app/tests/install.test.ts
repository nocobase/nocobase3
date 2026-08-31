import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { syncPluginSkills } from '../src/lib/install.ts';

const created: string[] = [];

afterEach(async () => {
  await Promise.all(
    created
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

/**
 * A stand-in project whose `plugin:skills:sync` script is whatever the test needs it to be. The real script runs the
 * CLI against installed plugins, which needs a full install; what this function has to cover is how the caller reacts
 * to the script succeeding or failing, and that only needs a script.
 */
async function createProject(script: string): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'create-app-skills-'));
  created.push(directory);

  await writeFile(
    path.join(directory, 'package.json'),
    `${JSON.stringify(
      {
        name: 'app',
        version: '0.0.0',
        scripts: { 'plugin:skills:sync': script },
      },
      null,
      2,
    )}\n`,
    'utf8',
  );

  return directory;
}

describe('syncPluginSkills', () => {
  it('runs the app-side script and reports success', async () => {
    const directory = await createProject(
      `node -e "require('node:fs').writeFileSync('marker', 'ran')"`,
    );

    await expect(syncPluginSkills(directory)).resolves.toEqual({ ok: true });
    await expect(
      readFile(path.join(directory, 'marker'), 'utf8'),
    ).resolves.toBe('ran');
  });

  it('reports a failure with the command the user can run themselves', async () => {
    const directory = await createProject('node -e "process.exit(1)"');

    const result = await syncPluginSkills(directory);

    expect(result.ok).toBe(false);
    expect(result.reason).toContain('pnpm plugin:skills:sync');
  });

  it('reports a failure when the project has no such script', async () => {
    const directory = await mkdtemp(
      path.join(os.tmpdir(), 'create-app-skills-'),
    );
    created.push(directory);
    await writeFile(
      path.join(directory, 'package.json'),
      `${JSON.stringify({ name: 'app', version: '0.0.0' }, null, 2)}\n`,
      'utf8',
    );

    const result = await syncPluginSkills(directory);

    expect(result.ok).toBe(false);
    expect(result.reason).toContain(
      'Could not synchronize plugin skills into .agents/skills.',
    );
  });
});
