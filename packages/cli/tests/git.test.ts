import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { cloneHubRepository } from '../src/lib/git.ts';

describe('Hub Git client', () => {
  it('uses temporary askpass credentials and keeps the token out of the clone URL', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'nb3-git-'));
    const destination = path.join(root, 'app');
    const invocation = path.join(root, 'invocation.json');
    const fakeGit = path.join(root, 'git');
    await writeFile(
      fakeGit,
      `#!/bin/sh
printf '{"args":"%s","askpass":"%s","prompt":"%s"}' "$*" "$GIT_ASKPASS" "$GIT_TERMINAL_PROMPT" > "${invocation}"
for destination do :; done
mkdir -p "$destination"
`,
      { mode: 0o700 },
    );

    await cloneHubRepository({
      cloneUrl: 'https://hub.example.com/hub/git/sales.git',
      destination,
      accessToken: 'super-secret-token',
      gitCommand: fakeGit,
    });

    const recorded = JSON.parse(await readFile(invocation, 'utf8')) as {
      args: string;
      askpass: string;
      prompt: string;
    };
    expect(recorded.args).toContain(
      'https://hub.example.com/hub/git/sales.git',
    );
    expect(recorded.args).not.toContain('super-secret-token');
    expect(recorded.askpass).toBeTruthy();
    expect(recorded.prompt).toBe('0');
    expect((await stat(destination)).isDirectory()).toBe(true);
    await rm(root, { recursive: true, force: true });
  });

  it('removes a partial clone and preserves a pre-existing empty target', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'nb3-git-failure-'));
    const destination = path.join(root, 'app');
    const fakeGit = path.join(root, 'git');
    await mkdir(destination);
    await writeFile(
      fakeGit,
      `#!/bin/sh
for destination do :; done
mkdir -p "$destination/.git"
printf partial > "$destination/partial"
exit 9
`,
      { mode: 0o700 },
    );

    await expect(
      cloneHubRepository({
        cloneUrl: 'https://hub.example.com/hub/git/sales.git',
        destination,
        accessToken: 'super-secret-token',
        gitCommand: fakeGit,
      }),
    ).rejects.toMatchObject({ exitCode: 9 });

    expect(await readdir(destination)).toEqual([]);
    expect(
      (await readdir(root)).filter((entry) => entry.includes('.nb3-clone-')),
    ).toEqual([]);
    await rm(root, { recursive: true, force: true });
  });
});
