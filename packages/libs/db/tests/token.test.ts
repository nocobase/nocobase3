import { describe, expect, it } from 'vitest';

import { databaseManagerToken, type DatabaseManager } from '../src/index.js';
import { ServiceContainer } from '@nocobase/service-provider';

describe('databaseManagerToken', () => {
  it('identifies the shared database manager capability', () => {
    const database = {} as DatabaseManager;
    const services = new ServiceContainer();

    services.instance(databaseManagerToken, database);

    expect(databaseManagerToken.name).toBe('@nocobase/db/manager');
    expect(services.resolve(databaseManagerToken)).toBe(database);
  });
});
