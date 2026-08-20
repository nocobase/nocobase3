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

const joinBase = (base: string, pathInsideBase: string) => {
  const basePath = normalizeBase(base).replace(/\/$/, "");
  const pathInside = pathInsideBase.replace(/^\/+|\/+$/g, "");
  return `${basePath}/${pathInside}`;
};

const numberFromEnv = (value?: string) => {
  if (!value) return undefined;

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
};

const optionalDefineEnv = (
  define: Record<string, string>,
  key: string,
  value: string | undefined
) => {
  const normalized = value?.trim();
  if (normalized) {
    define[`import.meta.env.${key}`] = JSON.stringify(normalized);
  }
};

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const appBase = normalizeBase(env.APP_BASE_PATH ?? "/app-template-default");
  const viteBase = appBase;
  const publicApiUrl =
    command === "serve"
      ? mode === "e2e" && env.NOCOBASE_E2E_API_URL?.trim()
        ? env.NOCOBASE_E2E_API_URL.trim().replace(/\/$/, "")
        : joinBase(appBase, "/v2/api")
      : undefined;
  const viteHmrHost = env.APP_VITE_HMR_HOST;
  const viteDevPort = numberFromEnv(env.APP_VITE_DEV_PORT) ?? 5173;
  const registrySourceRoot = path.resolve(__dirname, "./registry");
  const extensionsRoot = fs.existsSync(registrySourceRoot)
    ? registrySourceRoot
    : path.resolve(__dirname, "./client/extensions");
  const defineEnv: Record<string, string> = {
    __PORTAL_DEV_SOURCE_ROOT__: JSON.stringify(
      command === "serve" ? path.resolve(__dirname) : ""
    ),
    __PORTAL_TEMPLATE_NAME__: JSON.stringify(portalTemplate.displayName),
    __PORTAL_TEMPLATE_VERSION__: JSON.stringify(portalTemplate.version),
  };

  if (publicApiUrl) {
    defineEnv["import.meta.env.NOCOBASE_API_URL"] = JSON.stringify(publicApiUrl);
  }

  optionalDefineEnv(
    defineEnv,
    "NOCOBASE_AUTHENTICATOR",
    env.NOCOBASE_AUTHENTICATOR ?? env.NOCOBASE_E2E_AUTHENTICATOR
  );
  optionalDefineEnv(defineEnv, "NOCOBASE_WS_URL", env.NOCOBASE_WS_URL);
  optionalDefineEnv(defineEnv, "NOCOBASE_WS_PATH", env.NOCOBASE_WS_PATH);

  return {
    base: viteBase,
    define: defineEnv,
    envPrefix: ["VITE_"],
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
              // When the dev server listens on 0.0.0.0, let the client reuse
              // the hostname from the page URL. This keeps HMR working for
              // both localhost and LAN clients.
              ...(viteHmrHost ? { host: viteHmrHost } : {}),
              clientPort: viteDevPort,
            },
          }
        : undefined,
  };
});
