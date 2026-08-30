import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

const packageRoot = new URL('../', import.meta.url);
const skillPath = new URL(
  'skills/nocobase-app-plugin-system-info/SKILL.md',
  packageRoot,
);

describe('@nocobase/app-plugin-system-info Skill', () => {
  it('ships App-facing usage guidance for the real public surfaces', async () => {
    const [packageSource, skillSource] = await Promise.all([
      readFile(new URL('package.json', packageRoot), 'utf8'),
      readFile(skillPath, 'utf8'),
    ]);
    const packageJson = JSON.parse(packageSource) as {
      readonly files?: unknown;
    };

    expect(packageJson.files).toContain('skills');
    expect(skillSource).toContain('name: nocobase-app-plugin-system-info');
    expect(skillSource).toContain('/system-info');
    expect(skillSource).toContain('GET /api/system-info');
    expect(skillSource).not.toMatch(/starter|placeholder|manage its settings/i);
  });
});
