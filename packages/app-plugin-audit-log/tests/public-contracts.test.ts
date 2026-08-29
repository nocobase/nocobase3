import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

describe('@nocobase/app-plugin-audit-log public contracts', () => {
  it('publishes every scaffold resource from its package-owned location', async () => {
    const manifest = JSON.parse(
      await fs.readFile(
        fileURLToPath(new URL('../package.json', import.meta.url)),
        'utf8',
      ),
    ) as { files?: string[] };

    expect(manifest.files).toEqual(
      expect.arrayContaining([
        'CHANGELOG.md',
        'components.json',
        'database',
        'skills',
      ]),
    );
    expect(manifest.files).not.toContain('.agents');
    await expect(
      fs.readFile(
        fileURLToPath(
          new URL(
            '../skills/nocobase-app-plugin-audit-log/SKILL.md',
            import.meta.url,
          ),
        ),
        'utf8',
      ),
    ).resolves.toContain('name: nocobase-app-plugin-audit-log');
  });
});
