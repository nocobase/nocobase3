import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import { joinBasePath } from '@nocobase/app-server/support';
import {
  defineRootRoutes,
  type AppRootRouteContribution,
} from '@nocobase/app-server/router';
import { Hono } from 'hono';

import { mailServiceToken } from '../tokens.js';

/** Public OAuth callback secured by a short-lived, one-time state transaction. */
export const mailOAuthCallbackRoutes: AppRootRouteContribution<AppPluginApplication> =
  defineRootRoutes(({ container, publicBasePath }) => {
    const router = new Hono();
    const mail = container.resolve(mailServiceToken);

    router.get('/mail/oauth/callback', async (context) => {
      const state = context.req.query('state');
      if (!state) {
        return context.json(
          {
            error: {
              code: 'MAIL_AUTHORIZATION_STATE_REQUIRED',
              message: 'Mail authorization state is required.',
            },
          },
          400,
        );
      }
      try {
        await mail.completeAuthorization({
          state,
          code: context.req.query('code'),
          error: context.req.query('error'),
          errorDescription: context.req.query('error_description'),
        });
        return context.redirect(
          `${joinBasePath(publicBasePath, '/settings/mail')}?mailAuthorization=success`,
        );
      } catch {
        return context.redirect(
          `${joinBasePath(publicBasePath, '/settings/mail')}?mailAuthorization=failure`,
        );
      }
    });

    return router;
  });
