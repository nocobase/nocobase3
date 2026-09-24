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

const scriptPath = path.resolve(
  import.meta.dirname,
  '../src/scripts/utils/copy-ai-skills.mjs',
);
const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function createApplication(): string {
  const root = mkdtempSync(path.join(os.tmpdir(), 'nocobase-ai-skills-'));
  temporaryDirectories.push(root);
  return root;
}

function write(filePath: string, contents: string): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, contents);
}

function copy(root: string): { status: number | null; stdout: string } {
  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, NOCOBASE_TOOL_ROOT: root },
  });
  return { status: result.status, stdout: result.stdout };
}

describe('copy-ai-skills', () => {
  it('carries every SKILL.md into dist, keeping its directory', () => {
    const root = createApplication();
    write(
      path.join(root, 'ai/skills/order-intake/SKILL.md'),
      '---\nname: order-intake\n---\n',
    );
    write(
      path.join(root, 'ai/skills/nested/deeper/SKILL.md'),
      '---\nname: deeper\n---\n',
    );

    const { status, stdout } = copy(root);

    expect(status).toBe(0);
    expect(stdout).toContain('Copied 2 application Skill files');
    expect(
      readFileSync(
        path.join(root, 'dist/ai/skills/order-intake/SKILL.md'),
        'utf8',
      ),
    ).toContain('name: order-intake');
    expect(
      existsSync(path.join(root, 'dist/ai/skills/nested/deeper/SKILL.md')),
    ).toBe(true);
  });

  it('carries the pages a SKILL.md links to, so a reference is never a dead link', () => {
    const root = createApplication();
    write(
      path.join(root, 'ai/skills/reporting/SKILL.md'),
      '# Reporting\n\nSee [contracts](references/contracts.md).\n',
    );
    write(
      path.join(root, 'ai/skills/reporting/references/contracts.md'),
      '# Contracts\n',
    );
    write(
      path.join(root, 'ai/skills/reporting/references/nested/more.md'),
      '# More\n',
    );

    expect(copy(root).status).toBe(0);

    expect(
      existsSync(
        path.join(root, 'dist/ai/skills/reporting/references/contracts.md'),
      ),
    ).toBe(true);
    expect(
      existsSync(
        path.join(root, 'dist/ai/skills/reporting/references/nested/more.md'),
      ),
    ).toBe(true);
  });

  it('carries no code, because a Skill directory holds no implementation', () => {
    const root = createApplication();
    write(path.join(root, 'ai/skills/reporting/SKILL.md'), '# Reporting\n');
    write(path.join(root, 'ai/skills/reporting/tools/legacy.ts'), 'export {};');
    write(path.join(root, 'ai/skills/reporting/fixture.json'), '{}');

    expect(copy(root).status).toBe(0);

    expect(
      existsSync(path.join(root, 'dist/ai/skills/reporting/SKILL.md')),
    ).toBe(true);
    expect(
      existsSync(path.join(root, 'dist/ai/skills/reporting/tools/legacy.ts')),
    ).toBe(false);
    expect(
      existsSync(path.join(root, 'dist/ai/skills/reporting/fixture.json')),
    ).toBe(false);
  });

  it('succeeds on an application that defines no Skills', () => {
    const root = createApplication();

    const { status, stdout } = copy(root);

    expect(status).toBe(0);
    expect(stdout).toContain('Copied 0 application Skill files');
    expect(existsSync(path.join(root, 'dist/ai'))).toBe(false);
  });
});
