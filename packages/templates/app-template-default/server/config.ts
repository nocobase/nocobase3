import { environmentMappings } from './environment.js';
import { environmentProvider } from '@nocobase/config/providers/env';
import { AppConfig } from '@nocobase/app-server/config';
import type { ResolvedAppRuntimeConfigContext } from '@nocobase/app-server/runtime';

export function createAppConfig(
  context: ResolvedAppRuntimeConfigContext,
): AppConfig {
  const config = new AppConfig();
  const configuredPath =
    context.configPath ?? context.environment.APP_CONFIG_FILE;
  const configPath = context.paths.root(configuredPath ?? 'config');

  config.loadFile(configPath, { optional: configuredPath === undefined });

  config.load(
    environmentProvider(context.environment, { mappings: environmentMappings }),
  );

  return config;
}
