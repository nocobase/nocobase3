import { describe, expect, it } from 'vitest';

import { ServiceContainer } from '@nocobase/service-provider';

import { IdGeneratorProvider, idGeneratorToken } from '../src/index.js';

describe('IdGeneratorProvider', () => {
  it('registers a singleton Snowflake generator with the configured worker ID', () => {
    const serviceContainer = new ServiceContainer();
    const provider = new IdGeneratorProvider({
      runtime: { config: { snowflake: { workerId: 7 } } },
      serviceContainer,
    });

    provider.register();
    const generator = serviceContainer.resolve(idGeneratorToken);

    expect(provider.name).toBe('@nocobase/id-generator');
    expect(generator.workerId).toBe(7);
    expect(serviceContainer.resolve(idGeneratorToken)).toBe(generator);
  });
});
