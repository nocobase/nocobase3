import { describe, expect, it } from 'vitest';

import bootstrapInstallPlugin from '../server/bootstrap.js';

describe('@nocobase/app-plugin-install', () => {
  it('runs its bootstrap entry', () => {
    expect(() =>
      bootstrapInstallPlugin({
        config: undefined,
        deps: undefined,
        services: undefined,
        lifecycle: {
          registerDisposer() {},
        },
      }),
    ).not.toThrow();
  });
});
