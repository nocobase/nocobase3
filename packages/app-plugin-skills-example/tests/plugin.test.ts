import { describe, expect, it } from 'vitest';

import plugin from '../server/plugin.js';

describe('@nocobase/app-plugin-skills-example', () => {
  it('declares only its selected Server capabilities', () => {
    expect(plugin).toMatchObject({
      packageName: '@nocobase/app-plugin-skills-example',
      providers: expect.any(Array),
      routes: expect.any(Array),
    });
  });
});
