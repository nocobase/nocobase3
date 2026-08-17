import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "path";
import { defineConfig, loadEnv } from "vite";
import { portalSdkCompatibilityPlugin } from "@nocobase/portal-sdk/vite";

const portalTemplate = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "package.json"), "utf8")
) as { displayName: string; version: string };

const normalizeBase = (base?: string) => {
  const normalized = String(base || "/").trim();
  if (!normalized || normalized === "/") return "/";
  return `/${normalized.replace(/^\/+|\/+$/g, "")}/`;
};

const numberFromEnv = (value?: string) => {
  if (!value) return undefined;

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
};

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const appName = env.APP_NAME || "app-template-default";
  const appBase = normalizeBase(env.APP_BASE_PATH ?? `/${appName}`);
  const viteBase = appBase;
  const viteDevHost = env.APP_VITE_DEV_HOST || "127.0.0.1";
  const viteDevPort = numberFromEnv(env.APP_VITE_DEV_PORT) ?? 5173;
  const registrySourceRoot = path.resolve(__dirname, "./registry");
  const extensionsRoot = fs.existsSync(registrySourceRoot)
    ? registrySourceRoot
    : path.resolve(__dirname, "./client/extensions");

  return {
    base: viteBase,
    define: {
      __PORTAL_DEV_SOURCE_ROOT__: JSON.stringify(
        command === "serve" ? path.resolve(__dirname) : ""
      ),
      __PORTAL_TEMPLATE_NAME__: JSON.stringify(portalTemplate.displayName),
      __PORTAL_TEMPLATE_VERSION__: JSON.stringify(portalTemplate.version),
    },
    envPrefix: ["VITE_", "NOCOBASE_", "API_CLIENT_"],
    plugins: [
      portalSdkCompatibilityPlugin({ root: __dirname }),
      react(),
      tailwindcss(),
    ],
    resolve: {
      alias: {
        "@/extensions": extensionsRoot,
        "@": path.resolve(__dirname, "./client"),
      },
    },
    build: {
      outDir: "dist/client",
    },
    server:
      command === "serve"
        ? {
            hmr: {
              host: viteDevHost,
              clientPort: viteDevPort,
            },
          }
        : undefined,
  };
});
