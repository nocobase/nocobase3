import {
  authorizationToken,
  type AuthorizationEnv,
} from '@nocobase/app-plugin-authorization';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import { defineRepositoryApiRoutes } from '@nocobase/app-server/router';
import { Hono } from 'hono';

import { PROJECTS } from '../sales-authorization.js';
import { projectResource } from '../sales-resources.js';
import { editableValues } from './mutations.js';

const repositoryRoutes = defineRepositoryApiRoutes({
  repositories: [
    {
      name: 'salesProjects',
      collection: PROJECTS,
      policy: {
        read: {
          scope: true,
          fields: ['id', 'title', 'region', 'ownerId', 'confidential', 'notes'],
        },
        update: { scope: true, fields: ['title', 'notes'] },
        create: false,
        delete: false,
      },
      actions: {
        findMany: { maxLimit: 100 },
        findOne: {},
        count: {},
        updateOne: {},
      },
    },
  ],
});

/** Composed only under the example's authenticated route boundary. */
export async function createProjectRoutes(
  app: AppPluginApplication,
): Promise<Hono<AuthorizationEnv>> {
  const authz = app.container.resolve(authorizationToken);
  const router = new Hono<AuthorizationEnv>();

  router.use(
    '*',
    authz.db.authorizeRepository({
      repository: 'salesProjects',
      resource: projectResource.reference(),
      actions: {
        findMany: 'view',
        findOne: 'view',
        count: 'view',
        updateOne: 'edit',
      },
    }),
  );

  router.use('/salesProjects:updateOne', async (c, next) => {
    // Leave the original stream for the Repository body limit and parser.
    const body: unknown = await c.req.raw
      .clone()
      .json()
      .catch(() => {
        throw new TypeError('Invalid JSON');
      });
    if (!body || typeof body !== 'object' || Array.isArray(body))
      throw new TypeError('Expected update input');

    editableValues(Reflect.get(body, 'values'), ['title', 'notes']);
    await next();
  });

  router.route('/', await repositoryRoutes.createRouter(app));
  return router;
}
