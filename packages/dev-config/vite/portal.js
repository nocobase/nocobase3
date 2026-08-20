import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig, loadEnv, mergeConfig } from "vite";

const positiveInteger = (value) => {
  if (!value) return undefined;

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
};

export const createPortalViteConfig = (
  portalSdkCompatibilityPlugin,
  localConfig = {},
) =>
  defineConfig(async (configEnvironment) => {
    const localConfigValue =
      typeof localConfig === "function"
        ? localConfig(configEnvironment)
        : localConfig;
    const resolvedLocalConfig = (await localConfigValue) ?? {};
    const root = path.resolve(resolvedLocalConfig.root ?? process.cwd());
    const envDirectory = path.resolve(root, resolvedLocalConfig.envDir ?? ".");
    const env = loadEnv(configEnvironment.mode, envDirectory, "");
    const devHost = env.APP_VITE_DEV_HOST || "127.0.0.1";
    const devPort = positiveInteger(env.APP_VITE_DEV_PORT) ?? 5173;
    const sharedConfig = {
      root,
      plugins: [portalSdkCompatibilityPlugin({ root }), react(), tailwindcss()],
      build: {
        outDir: "dist/client",
      },
      server:
        configEnvironment.command === "serve"
          ? {
              hmr: {
                host: devHost,
                clientPort: devPort,
              },
            }
          : undefined,
    };

    return mergeConfig(sharedConfig, resolvedLocalConfig);
  });
