import { describe, expect, it } from 'vitest';

import { ServiceContainer } from '@nocobase/service-provider';

import { IdGeneratorProvider, idGeneratorToken } from '../src/index.js';

describe('IdGeneratorProvider', () => {
  it('registers a singleton Snowflake generator with the configured worker ID', () => {
    const container = new ServiceContainer();
    const provider = new IdGeneratorProvider({
      config: { snowflake: { workerId: 7 } },
      container,
    });

    provider.register();
    const generator = container.resolve(idGeneratorToken);

    expect(provider.name).toBe('@nocobase/id-generator');
    expect(generator.workerId).toBe(7);
    expect(container.resolve(idGeneratorToken)).toBe(generator);
  });
});
