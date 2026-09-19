import { environmentMappings } from './environment.js';
import { environmentProvider } from '@nocobase/config/providers/env';
import {
  AppConfig,
  resolveDefaultAppConfigFile,
} from '@nocobase/app-server/config';
import type { ResolvedAppRuntimeConfigContext } from '@nocobase/app-server/runtime';

export function createAppConfig(
  context: ResolvedAppRuntimeConfigContext,
): AppConfig {
  const config = new AppConfig();
  const configuredPath =
    context.configPath ?? context.environment.APP_CONFIG_FILE;
  // Deployment configuration stays beside the compiled code directory.
  const configPath =
    configuredPath === undefined
      ? resolveDefaultAppConfigFile(context.paths)
      : context.paths.root(configuredPath);

  config.loadFile(configPath, { optional: configuredPath === undefined });

  config.load(
    environmentProvider(context.environment, { mappings: environmentMappings }),
  );

  return config;
}
