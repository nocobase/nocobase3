import { AppConfig } from '@nocobase/app-server/config';
import { coreConfigs } from '@nocobase/app-server';
import { objectProvider } from '@nocobase/config/providers/object';
import type { ResolvedAppRuntimeConfigContext } from '@nocobase/app-server/runtime';

export function createAppConfig(
  context: ResolvedAppRuntimeConfigContext,
): AppConfig<ResolvedAppRuntimeConfigContext> {
  const config = new AppConfig<ResolvedAppRuntimeConfigContext>(
    [...coreConfigs, ...context.configs],
    {
      context,
      environment: context.environment,
    },
  );
  const configuredPath =
    context.configPath ?? context.environment.APP_CONFIG_FILE;
  const configPath = context.paths.root(configuredPath ?? 'config');

  // This application-owned demonstration needs a second connection even when
  // create-app writes only the selected main database into config.yml.
  // Loading before the file keeps deployment connection overrides authoritative.
  config.load(
    objectProvider({
      database: {
        connections: {
          analytics: {
            dialect: 'sqlite',
            database: 'analytics.sqlite',
            schemaManagement: 'managed',
            migrations: { autoRun: true },
            seeds: { autoRun: true },
          },
        },
      },
    }),
  );
  config.loadFile(configPath, { optional: configuredPath === undefined });

  return config;
}
