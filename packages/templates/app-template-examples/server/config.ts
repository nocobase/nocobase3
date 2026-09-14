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
  // Without an explicit path, look next to `dist/` as well: a built application runs with its root at `dist/`, but a
  // deployment writes `config.yml` beside `dist/` where `pnpm build --tar` placed `config.example.yml`.
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
