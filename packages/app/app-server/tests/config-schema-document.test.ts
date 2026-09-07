import { Type } from '@sinclair/typebox';
import { describe, expect, it } from 'vitest';

import {
  createAppConfigSchemaArtifact,
  defineAppConfig,
  defineAppConfigVariant,
} from '../src/config/index.js';

describe('App config schema document', () => {
  it('serializes config and variant schemas without evaluating defaults', () => {
    let defaultsCalled = false;
    const artifact = createAppConfigSchemaArtifact([
      defineAppConfig({
        namespace: 'feature',
        schema: Type.Object({ enabled: Type.Boolean() }),
        defaults: () => {
          defaultsCalled = true;
          return { enabled: true };
        },
      }),
      defineAppConfigVariant({
        target: 'feature.providers',
        discriminator: 'driver',
        value: 'memory',
        schema: Type.Object({ max: Type.Integer() }),
      }),
    ]);

    expect(defaultsCalled).toBe(false);
    expect(artifact.document).toMatchObject({
      formatVersion: 1,
      configs: [{ namespace: 'feature' }],
      variants: [
        {
          target: 'feature.providers',
          discriminator: 'driver',
          value: 'memory',
        },
      ],
    });
    expect(artifact.digest).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.parse(artifact.json)).toEqual(artifact.document);
  });
});
