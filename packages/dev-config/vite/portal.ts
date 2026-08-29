import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import type {
  ConfigEnv,
  PluginOption,
  UserConfig,
  UserConfigExport,
} from 'vite';
import { defineConfig, loadEnv, mergeConfig } from 'vite';

export type PortalSdkCompatibilityPluginFactory = (options: {
  root: string;
}) => PluginOption;

const positiveInteger = (value: string | undefined): number | undefined => {
  if (!value) return undefined;

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
};

const resolveLocalConfig = async (
  localConfig: UserConfigExport,
  configEnvironment: ConfigEnv,
): Promise<UserConfig> => {
  const localConfigValue =
    typeof localConfig === 'function'
      ? localConfig(configEnvironment)
      : localConfig;

  return (await localConfigValue) ?? {};
};

export const createPortalViteConfig: (
  portalSdkCompatibilityPlugin: PortalSdkCompatibilityPluginFactory,
  localConfig?: UserConfigExport,
) => UserConfigExport = (portalSdkCompatibilityPlugin, localConfig = {}) =>
  defineConfig(async (configEnvironment): Promise<UserConfig> => {
    const resolvedLocalConfig = await resolveLocalConfig(
      localConfig,
      configEnvironment,
    );
    const root = path.resolve(resolvedLocalConfig.root ?? process.cwd());
    const envDirectory =
      resolvedLocalConfig.envDir === false
        ? undefined
        : path.resolve(root, resolvedLocalConfig.envDir ?? '.');
    const env: Record<string, string> = envDirectory
      ? loadEnv(configEnvironment.mode, envDirectory, '')
      : {};
    const devPort = positiveInteger(env.APP_VITE_DEV_PORT) ?? 5173;
    const sharedConfig: UserConfig = {
      root,
      plugins: [portalSdkCompatibilityPlugin({ root }), react(), tailwindcss()],
      build: {
        outDir: 'dist/client',
      },
      server:
        configEnvironment.command === 'serve'
          ? {
              hmr: {
                clientPort: devPort,
              },
            }
          : undefined,
    };

    return mergeConfig(sharedConfig, resolvedLocalConfig);
  });
