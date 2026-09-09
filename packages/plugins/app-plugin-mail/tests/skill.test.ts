import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const packageRoot = resolve(import.meta.dirname, '..');

describe('@nocobase/app-plugin-mail Skill', () => {
  it('publishes the real App-facing Mail workflow', async () => {
    const [manifestSource, skillSource] = await Promise.all([
      readFile(resolve(packageRoot, 'package.json'), 'utf8'),
      readFile(
        resolve(packageRoot, 'skills/nocobase-app-plugin-mail/SKILL.md'),
        'utf8',
      ),
    ]);
    const manifest = JSON.parse(manifestSource) as {
      readonly exports?: Record<string, unknown>;
      readonly files?: readonly string[];
    };

    expect(manifest.files).toContain('skills');
    expect(manifest.exports).toHaveProperty('./server/tokens');
    expect(manifest.exports).toHaveProperty('./client/components');
    expect(skillSource).toContain('@nocobase/app-plugin-mail/server/tokens');
    expect(skillSource).toContain('POST /api/mail/messages/send');
    expect(skillSource).toContain('POST /api/mail/accounts/:accountId/sync');
    expect(skillSource).not.toMatch(/development draft|placeholder|TODO/iu);
  });
});
