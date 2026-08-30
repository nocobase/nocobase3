import {
  authenticationToken,
  type Auth,
} from '@nocobase/app-plugin-authentication';
import type { AppPluginApplication } from '@nocobase/app-server-kit/plugins';
import {
  defineApiRoutes,
  type AppApiRouteContribution,
} from '@nocobase/app-server-kit/router';
import { Hono } from 'hono';

import { appNoticeServiceToken, type AppNoticeService } from '../tokens.js';

export interface SkillsExampleAuthentication {
  required(): ReturnType<Auth['required']>;
}

export function registerSkillsExampleRoutes(
  router: Hono,
  authentication: SkillsExampleAuthentication,
  notice: AppNoticeService,
): void {
  router.use('/skills-example/notice', authentication.required());
  router.get('/skills-example/notice', (context) =>
    context.json(notice.getDefaultNotice()),
  );
}

export const apiRoutes: AppApiRouteContribution<AppPluginApplication> =
  defineApiRoutes(({ container }) => {
    const router = new Hono();
    registerSkillsExampleRoutes(
      router,
      container.resolve(authenticationToken),
      container.resolve(appNoticeServiceToken),
    );
    return router;
  });

const routes: readonly AppApiRouteContribution<AppPluginApplication>[] = [
  apiRoutes,
];

export default routes;
