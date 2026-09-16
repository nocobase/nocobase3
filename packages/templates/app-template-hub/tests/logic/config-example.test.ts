import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { AppConfig } from '@nocobase/app-server/config';

describe('Hub configuration example', () => {
  it('preserves application identity defaults when optional settings are left commented', async () => {
    const config = new AppConfig();
    config.loadFile(
      path.resolve(import.meta.dirname, '../../config.example.yml'),
    );
    await config.loadAll();
    config.mergeDefaults({
      app: { name: 'hub', publicBasePath: '/hub', publicApiUrl: '/hub/api' },
    });

    expect(config.get('app')).toMatchObject({
      name: 'hub',
      publicBasePath: '/hub',
      publicApiUrl: '/hub/api',
    });
  });
});
