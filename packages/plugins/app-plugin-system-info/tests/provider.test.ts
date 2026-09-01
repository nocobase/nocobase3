import { ServiceContainer } from '@nocobase/service-provider';
import { describe, expect, it } from 'vitest';

import packageMetadata from '../package.json' with { type: 'json' };

import { SystemInfoProvider } from '../server/providers/system-info.js';
import { DefaultSystemInfoService } from '../server/services/system-info.js';
import { systemInfoServiceToken } from '../server/tokens.js';

describe('@nocobase/app-plugin-system-info', () => {
  it('registers its service as a lazy singleton', () => {
    const container = new ServiceContainer();
    const provider = new SystemInfoProvider({ container });

    expect(provider.name).toBe('@nocobase/app-plugin-system-info');
    expect(container.resolveIfCreated(systemInfoServiceToken)).toBeUndefined();

    provider.register();

    const service = container.resolve(systemInfoServiceToken);
    expect(service).toBeInstanceOf(DefaultSystemInfoService);
    expect(service.getInfo()).toMatchObject({
      packageName: '@nocobase/app-plugin-system-info',
      // Read from the manifest rather than written out: `changeset version` rewrites the version during a release,
      // and the release runs the tests after that rewrite, so a literal here fails every release.
      version: packageMetadata.version,
      nodeVersion: process.version,
    });
    expect(service.getInfo().serverTime).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(container.resolve(systemInfoServiceToken)).toBe(service);
  });
});
