import { Hono } from 'hono';
import { authenticationToken } from '@nocobase/app-plugin-authentication';
import { defineApiRoutes } from '@nocobase/app-server/router';
import type { Application } from '@nocobase/app-server/application';
import type { AuditConfig } from '@nocobase/app-plugin-audit/server';
import { auditExampleRoutes } from '../../skills/nocobase-app-plugin-audit/examples/http.js';
import { dialects } from '../helpers/database-fixtures.js';
import {
  createProductionApp,
  type ProductionApp,
} from '../helpers/system-fixture.js';

export type SkillsApp = ProductionApp;

export async function createSkillsApp(
  dialect: (typeof dialects)[number],
  enabled: boolean = true,
  overrides: Partial<AuditConfig> = {},
  additionalStore: boolean = false,
): Promise<SkillsApp> {
  const s = await createProductionApp(
    dialect,
    enabled,
    overrides,
    additionalStore,
    'audit_example_items',
  );
  const mount = (app: Application): Application => {
    app.addRoutes(auditExampleRoutes);
    app.addRoutes(
      defineApiRoutes(({ container }) => {
        const routes = new Hono();
        routes.post(
          '/g21/insert',
          container.resolve(authenticationToken).required(),
          async (context) => {
            await s.f.connection.query
              .insertInto('audit_example_items')
              .values({ id: 'after', name: 'G21-value-sentinel' })
              .execute();
            return context.json({ inserted: true });
          },
        );
        return routes;
      }),
    );
    return app;
  };
  mount(s.app);
  return { ...s, make: () => mount(s.make()) };
}
