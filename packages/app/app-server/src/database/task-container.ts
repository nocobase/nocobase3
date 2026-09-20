import type { ServiceResolver, ServiceToken } from '@nocobase/service-provider';
import { idGeneratorToken } from '../id-generator/token.js';

/** Only registration-ready infrastructure services may be exposed to database tasks. */
const allowedTokens: ReadonlySet<ServiceToken<unknown>> = new Set([
  idGeneratorToken,
]);

export function createTaskServiceResolver(
  source?: ServiceResolver,
): ServiceResolver {
  function assertAllowed<T>(token: ServiceToken<T>): void {
    if (!allowedTokens.has(token)) {
      throw new Error(
        `Service "${token.name}" is not allowed in migrations or seeds.`,
      );
    }
  }

  return Object.freeze({
    has<T>(token: ServiceToken<T>): boolean {
      return allowedTokens.has(token) && (source?.has(token) ?? false);
    },
    resolve<T>(token: ServiceToken<T>): T {
      assertAllowed(token);
      if (!source)
        throw new Error(
          `Service "${token.name}" is not registered in the database task container.`,
        );
      return source.resolve(token);
    },
    resolveIfCreated<T>(token: ServiceToken<T>): T | undefined {
      assertAllowed(token);
      return source?.resolveIfCreated(token);
    },
  });
}
