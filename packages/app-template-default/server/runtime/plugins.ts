import type { AppConfig } from '../config/index.js';

export function isFilesPluginEnabled(
  config: Pick<AppConfig, 'plugins'>,
): boolean {
  return config.plugins.some(
    (plugin) =>
      plugin.packageName === '@nocobase/app-plugin-files' && plugin.enabled,
  );
}
