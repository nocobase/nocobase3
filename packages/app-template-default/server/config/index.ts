import { AppConfig } from '@nocobase/app-server-kit/config';
import { coreConfigs } from '@nocobase/app-server-kit';
import type { ResolvedAppRuntimeConfigContext } from '@nocobase/app-server-kit/runtime';
import { yamlParser } from '@nocobase/config/parsers/yaml';
import { fileProvider } from '@nocobase/config/providers/file';

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
  const configPath = context.paths.root(configuredPath ?? 'config.yml');

  config.load(
    fileProvider(configPath, { optional: configuredPath === undefined }),
    yamlParser(),
  );

  return config;
}
