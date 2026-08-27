import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('application management package scripts', () => {
  it('exposes the Hub workflows through pnpm run', async () => {
    const manifest = JSON.parse(
      await readFile(path.resolve('package.json'), 'utf8'),
    ) as {
      devDependencies?: Record<string, string>;
      scripts?: Record<string, string>;
    };

    expect(manifest.scripts).toMatchObject({
      deploy: 'nocobase-app deploy',
      'hub:login': 'nocobase-app hub:login',
      'hub:logout': 'nocobase-app hub:logout',
      pull: 'nocobase-app pull',
      push: 'nocobase-app push',
      release: 'nocobase-app release',
      status: 'nocobase-app status',
    });
    expect(manifest.scripts?.publish).toBeUndefined();
    expect(manifest.devDependencies?.['@nocobase/nb3-cli']).toBe('workspace:^');
  });
});
