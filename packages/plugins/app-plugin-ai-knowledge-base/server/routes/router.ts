import type { Auth, AuthEnv } from '@nocobase/app-plugin-authentication/server';
import { Hono } from 'hono';

import type { KnowledgeBaseServiceFactory } from '../factories/service-factory.js';
import { createDocumentRoutes } from './documents.js';
import { createKnowledgeBaseRoutes } from './knowledge-bases.js';
import { createSegmentRoutes } from './segments.js';
import { createVectorDatabaseRoutes } from './vector-databases.js';

export function createKnowledgeBaseRouter(options: {
  readonly authentication: Auth;
  readonly services: KnowledgeBaseServiceFactory;
}): Hono<AuthEnv> {
  const router = new Hono<AuthEnv>();
  const routes = new Hono<AuthEnv>();
  const requireAuthentication = options.authentication.required();
  routes.use('*', (context, next) =>
    /\/(?:aiKnowledgeBase(?:Docs|DocSegments)?|aiVectorDatabases):/.test(
      context.req.path,
    )
      ? requireAuthentication(context, next)
      : next(),
  );
  routes.route(
    '/',
    createKnowledgeBaseRoutes({ service: options.services.knowledgeBases }),
  );
  routes.route(
    '/',
    createDocumentRoutes({ service: options.services.documents }),
  );
  routes.route(
    '/',
    createSegmentRoutes({ service: options.services.segments }),
  );
  routes.route(
    '/',
    createVectorDatabaseRoutes({ service: options.services.vectorDatabases }),
  );
  router.route('/', routes);
  return router;
}
