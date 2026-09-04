import type { Auth, AuthEnv } from '@nocobase/app-plugin-authentication/server';
import type { MiddlewareHandler } from 'hono';
import { Hono } from 'hono';
import { authenticationToken } from '@nocobase/app-plugin-authentication/server';
import { ServiceContainer } from '@nocobase/service-provider';
import { describe, expect, it, vi } from 'vitest';

import { serviceFactoryToken } from '../server/factories/service-factory.js';
import {
  knowledgeBaseApiRoutes,
  knowledgeBaseLegacyRoutes,
} from '../server/routes/index.js';
import type { KnowledgeBaseDocumentService } from '../server/services/knowledge-base-document-service.js';
import type { KnowledgeBaseSegmentService } from '../server/services/knowledge-base-segment-service.js';
import type { KnowledgeBaseService } from '../server/services/knowledge-base-service.js';
import type { VectorDatabaseService } from '../server/services/vector-database-service.js';
import type { KnowledgeBaseServiceFactory } from '../server/factories/service-factory.js';

function createAuthentication(authenticated: boolean): Auth {
  return {
    required: (): MiddlewareHandler<AuthEnv> => async (context, next) => {
      if (!authenticated) {
        return context.json(
          { code: 'UNAUTHORIZED', message: 'Authentication required' },
          401,
        );
      }
      context.set('auth', {
        user: { id: 'user-1' },
        session: {},
      } as never);
      await next();
    },
  } as Auth;
}

function createServices() {
  const knowledgeBases = {
    list: vi.fn().mockResolvedValue({
      data: [{ id: 1, name: 'Docs' }],
      meta: { count: 1, page: 1, pageSize: 20 },
    }),
    listStorageDisks: vi
      .fn()
      .mockReturnValue([{ value: 'local', label: 'local' }]),
  } as unknown as KnowledgeBaseService;
  const documents = {} as KnowledgeBaseDocumentService;
  const segments = {} as KnowledgeBaseSegmentService;
  const vectorDatabases = {} as VectorDatabaseService;
  return {
    knowledgeBases,
    documents,
    segments,
    vectorDatabases,
  } as KnowledgeBaseServiceFactory;
}
function createRouterContext(
  authenticated: boolean,
  services: KnowledgeBaseServiceFactory = createServices(),
) {
  const container = new ServiceContainer();
  container.instance(authenticationToken, createAuthentication(authenticated));
  container.instance(serviceFactoryToken, services);
  return {
    appName: 'main',
    config: {},
    container,
    paths: {},
    publicBasePath: '/',
  } as never;
}

describe('knowledge base production routes', () => {
  it.each([
    ['api', knowledgeBaseApiRoutes, '/aiKnowledgeBase:list'],
    ['legacy', knowledgeBaseLegacyRoutes, '/v2/api/aiKnowledgeBase:list'],
  ])(
    'protects the %s contribution with authentication',
    async (_name, contribution, path) => {
      const router = await contribution.createRouter(
        createRouterContext(false),
      );
      const response = await router.request(path);
      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
      });
    },
  );

  it.each([
    ['api', knowledgeBaseApiRoutes, '/aiKnowledgeBase:list'],
    ['legacy', knowledgeBaseLegacyRoutes, '/v2/api/aiKnowledgeBase:list'],
  ])(
    'preserves the %s action response envelope',
    async (_name, contribution, path) => {
      const router = await contribution.createRouter(createRouterContext(true));
      const response = await router.request(path);
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        data: {
          data: [{ id: 1, name: 'Docs' }],
          meta: { count: 1, page: 1, pageSize: 20 },
        },
      });
    },
  );

  it('maps handler failures through the route error boundary', async () => {
    const services = createServices();
    const context = createRouterContext(true, services);
    vi.mocked(services.knowledgeBases.list).mockRejectedValueOnce(
      new Error('Repository unavailable'),
    );
    const router = await knowledgeBaseApiRoutes.createRouter(context);

    const response = await router.request('/aiKnowledgeBase:list');

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      errors: [{ message: 'Repository unavailable' }],
    });
  });
  it('does not leak authentication middleware to a sibling router', async () => {
    const contributionRouter = await knowledgeBaseApiRoutes.createRouter(
      createRouterContext(false),
    );
    const applicationRouter = new Hono();
    applicationRouter.route('/api', contributionRouter);
    applicationRouter.get('/unrelated', (context) =>
      context.json({ ok: true }),
    );
    const response = await applicationRouter.request('/unrelated');
    expect(response.status).toBe(200);
  });
});
