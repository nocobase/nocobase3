import { createAuthEndpoint } from 'better-auth/api';
import { genericOAuth } from 'better-auth/plugins';
import type { BetterAuthPlugin } from 'better-auth';
import { authenticationToken, type AuthManager } from '../../index.js';
import type { ServiceContainer } from '@nocobase/service-provider';

export const greeting = () =>
  ({
    id: 'greeting',
    endpoints: {
      greeting: createAuthEndpoint(
        '/greeting',
        { method: 'GET' },
        async () => ({ greeting: 'hello' }),
      ),
    },
    schema: {
      user: { fields: { department: { type: 'string', required: true } } },
    },
  }) satisfies BetterAuthPlugin;

export const counter = () =>
  ({
    id: 'counter',
    endpoints: {
      count: createAuthEndpoint('/count', { method: 'GET' }, async () => ({
        count: 1,
      })),
    },
  }) satisfies BetterAuthPlugin;

declare module '@nocobase/app-plugin-authentication/server' {
  interface AuthenticationPluginTypes {
    greeting: ReturnType<typeof greeting>;
    counter: ReturnType<typeof counter>;
    genericOAuth: ReturnType<typeof genericOAuth>;
  }
}

export async function checkTypes(container: ServiceContainer) {
  const auth: AuthManager = container.resolve(authenticationToken);
  auth.mergeOptions({
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      onExistingUserSignUp: async ({ user }) => {
        user.email.toLowerCase();
      },
    },
  });
  const greetingResult: string = (await auth.api.greeting()).greeting;
  const countResult: number = (await auth.api.count()).count;
  const session = await auth.api.getSession({ headers: new Headers() });
  const department: string | undefined = session?.user.department;
  await auth.api.signInUsername({
    body: { username: 'admin', password: 'password' },
  });
  await auth.api.signInSocial({ body: { provider: 'company' } });
  // @ts-expect-error Native argument checking survives plugin composition.
  await auth.api.signInUsername({ body: { username: 123 } });
  // @ts-expect-error Undeclared endpoints are not exposed.
  await auth.api.missingEndpoint();
  return { greetingResult, countResult, department };
}
