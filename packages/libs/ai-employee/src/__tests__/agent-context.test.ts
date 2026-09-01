import { describe, expectTypeOf, it } from 'vitest';
import type { DatabaseManager } from '@nocobase/db';
import type { AgentContext, AgentState } from '../index.js';

describe('AgentContext public contract', () => {
  it('exports DatabaseManager and unknown repository/service defaults', () => {
    expectTypeOf<AgentContext['database']>().toEqualTypeOf<DatabaseManager>();
    expectTypeOf<AgentContext['repositories']>().toEqualTypeOf<unknown>();
    expectTypeOf<AgentContext['services']>().toEqualTypeOf<unknown>();
    expectTypeOf<AgentContext['state']>().toEqualTypeOf<AgentState>();
  });
});
