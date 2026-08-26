import { createAIEmployeeRuntime } from '../../server/runtime.js';
import { HeaderCurrentActorResolver } from '../../server/auth/current-actor.js';
import type { Context } from '../../server/context.js';
import { createTestAppDeps } from './test-app-deps.js';

export function createTestAIEmployeeRuntime(apiBasePath = '/v2/api') {
  const runtime = createAIEmployeeRuntime({
    apiBasePath,
    deps: createTestAppDeps(),
  });
  const resolver = new HeaderCurrentActorResolver();
  return {
    ...runtime,
    createRequestContext(request?: Request): Context {
      if (!request) return runtime;
      const actor = resolver.resolve(request);
      const numericId = Number(actor.id);
      const roles = [...new Set(actor.roles.length ? actor.roles : ['member'])];
      return {
        ...runtime,
        currentUser: {
          id: Number.isFinite(numericId) ? numericId : actor.id,
          roles,
          isRoot: roles.includes('root'),
          ...(actor.locale ? { locale: actor.locale } : {}),
          ...(actor.scope ? { scope: actor.scope } : {}),
        },
      };
    },
  };
}
