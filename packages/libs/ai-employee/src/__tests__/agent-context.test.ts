import { describe, expectTypeOf, it } from 'vitest';
import { createServiceToken } from '@nocobase/service-provider';
import { defineTools } from '../index.js';
import type { AgentContext, AgentState } from '../index.js';

interface Repositories {
  aiMessages: { find(): Promise<string[]> };
}
interface Managers {
  knowledgeBase: { retrievePrompt(query: string): Promise<string> };
}

const repositoriesToken = createServiceToken<Repositories>('test/repositories');
const managersToken = createServiceToken<Managers>('test/managers');

describe('AgentContext public contract', () => {
  it('carries this execution and nothing ambient', () => {
    expectTypeOf<AgentContext['state']>().toEqualTypeOf<AgentState>();
    expectTypeOf<AgentContext['deps']>().toEqualTypeOf<Record<string, never>>();
    // A tool reaches the database, the container and the App's managers only by
    // declaring them. Nothing hands them over ambiently.
    expectTypeOf<AgentContext>().not.toHaveProperty('database');
    expectTypeOf<AgentContext>().not.toHaveProperty('ai');
    expectTypeOf<AgentContext>().not.toHaveProperty('repositories');
    expectTypeOf<AgentContext>().not.toHaveProperty('services');
  });

  it('infers ctx.deps from the declared tokens', () => {
    defineTools({
      scope: 'SPECIFIED',
      definition: { name: 'typed', description: 'typed' },
      dependencies: {
        repositories: repositoriesToken,
        managers: managersToken,
      },
      invoke: async (ctx) => {
        // Exact, with no `undefined` leaking out of the token's optional
        // symbol property.
        expectTypeOf(ctx.deps.repositories).toEqualTypeOf<Repositories>();
        expectTypeOf(ctx.deps.managers).toEqualTypeOf<Managers>();
        return ctx.deps.managers.knowledgeBase.retrievePrompt('q');
      },
    });
  });

  it('gives a tool that declares nothing no deps to reach for', () => {
    defineTools({
      scope: 'SPECIFIED',
      definition: { name: 'plain', description: 'plain' },
      invoke: async (ctx) => {
        expectTypeOf(ctx.deps).toEqualTypeOf<Record<string, never>>();
        return ctx.actor.id;
      },
    });
  });
});
