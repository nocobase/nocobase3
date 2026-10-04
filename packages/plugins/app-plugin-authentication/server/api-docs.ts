import { normalizeBasePath } from '@nocobase/app-server/support';
import type {
  ApiDocsAccess,
  ApiDocumentFragment,
  OpenAPIV3_1,
} from '@nocobase/app-server/router';
import { APIError } from 'better-auth';

import type { Auth, AuthOpenAPIOperation } from './auth.js';

/** The tag every Better Auth operation carries in the application's API document. */
export const AUTHENTICATION_API_TAG = 'Authentication';

/** The prefix an `operationId` or component name takes when it collides with one already in the document. */
export const AUTHENTICATION_API_NAMESPACE = 'auth';

/**
 * Better Auth endpoints left out of the API document, as paths relative to Better Auth's base path. Each is a step of
 * a browser flow a script cannot meaningfully call on its own: the OAuth redirects and the provider callback, the
 * links sent by email that redirect the browser on, and the HTML error page those flows land on.
 */
export const BROWSER_ONLY_AUTH_PATHS: readonly string[] = [
  '/sign-in/social',
  '/link-social',
  '/callback/{id}',
  '/verify-email',
  '/reset-password/{token}',
  '/delete-user/callback',
  '/error',
];

const PACKAGE_NAME = '@nocobase/app-plugin-authentication';

/**
 * Lets a request with a signed-in session read the API documentation. The session is resolved exactly as the
 * plugin's routes resolve it, but without extending its expiry, and the cookies Better Auth would set are discarded, so
 * reading the documentation changes no state. A credential Better Auth refuses is simply not allowed here.
 */
export function createSessionApiDocsAccess(
  resolveAuth: () => Auth,
): ApiDocsAccess {
  return {
    name: PACKAGE_NAME,
    check: async (context) => {
      try {
        const session = await resolveAuth().getSession(
          context.req.raw.headers,
          { disableRefresh: true },
        );
        return session !== null;
      } catch (error) {
        if (error instanceof APIError) return false;
        throw error;
      }
    },
  };
}

/**
 * Better Auth's endpoints as an API document fragment, built from Better Auth's own OpenAPI generator: every endpoint
 * the configured Better Auth plugins serve, at its full `/api/auth/...` path below the application's base path, tagged
 * `Authentication`. The endpoints in `BROWSER_ONLY_AUTH_PATHS` are left out.
 */
export async function createAuthenticationApiFragment(
  auth: Auth,
  publicBasePath: string,
): Promise<ApiDocumentFragment> {
  const schema = await auth.openAPISchema();
  const prefix = appLocalPath(schema.basePath, publicBasePath);
  const paths: OpenAPIV3_1.PathsObject = {};
  for (const [path, item] of Object.entries(schema.paths)) {
    if (BROWSER_ONLY_AUTH_PATHS.includes(path)) continue;
    const operations: OpenAPIV3_1.PathItemObject = {};
    for (const [method, operation] of Object.entries(item)) {
      (operations as Record<string, OpenAPIV3_1.OperationObject>)[method] =
        toOperation(operation);
    }
    paths[`${prefix}${path}`] = operations;
  }
  return {
    owner: PACKAGE_NAME,
    namespace: AUTHENTICATION_API_NAMESPACE,
    paths,
    components: {
      schemas: schema.components
        .schemas as OpenAPIV3_1.ComponentsObject['schemas'],
    },
    tags: [
      {
        name: AUTHENTICATION_API_TAG,
        description:
          "Sign-in, sessions, accounts and API keys, served by Better Auth under /api/auth. Better Auth answers errors in its own body, `{ message, code }`, rather than the application's standard error body.",
      },
    ],
  };
}

/** Better Auth's public base path, such as `/main/api/auth`, as the path below the application's, `/api/auth`. */
function appLocalPath(basePath: string, publicBasePath: string): string {
  const base = normalizeBasePath(publicBasePath);
  const path = normalizeBasePath(basePath);
  return base && path.startsWith(`${base}/`) ? path.slice(base.length) : path;
}

function toOperation(
  operation: AuthOpenAPIOperation,
): OpenAPIV3_1.OperationObject {
  // Better Auth marks every operation as bearer-authenticated, which no NocoBase application configures; a session
  // cookie or an API key is what authenticates these requests, so the claim is dropped rather than repeated.
  const { security: _security, description, tags: _tags, ...rest } = operation;
  const summary =
    description ??
    (operation.operationId ? sentence(operation.operationId) : undefined);
  return {
    ...(rest as OpenAPIV3_1.OperationObject),
    tags: [AUTHENTICATION_API_TAG],
    ...(summary ? { summary } : {}),
  };
}

/** `isUsernameAvailable` as `Is username available`. */
function sentence(identifier: string): string {
  const words = identifier.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
