import fs from "node:fs";
import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL(".", import.meta.url));
const registryRoot = fileURLToPath(new URL("./registry", import.meta.url));
const clientExtensionsRoot = fileURLToPath(new URL("./client/extensions", import.meta.url));
const extensionsRoot = fs.existsSync(registryRoot)
  ? registryRoot
  : clientExtensionsRoot;
const localExtensionAliases = fs.existsSync(clientExtensionsRoot)
  ? fs.readdirSync(clientExtensionsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      find: `@/extensions/${entry.name}`,
      replacement: fileURLToPath(new URL(`./client/extensions/${entry.name}`, import.meta.url)),
    }))
  : [];

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      ...localExtensionAliases,
      {
        find: "@/jobs",
        replacement: fileURLToPath(new URL("./server/jobs", import.meta.url)),
      },
      {
        find: "@/services",
        replacement: fileURLToPath(new URL("./server/services", import.meta.url)),
      },
      {
        find: "@/extensions",
        replacement: extensionsRoot,
      },
      {
        find: "@",
        replacement: fileURLToPath(new URL("./client", import.meta.url)),
      },
    ],
  },
  test: {
    root,
    environment: "jsdom",
    setupFiles: ["./tests/setup/vitest.ts"],
    include: [
      "tests/logic/**/*.test.{ts,tsx}",
      "tests/components/**/*.test.{ts,tsx}",
      "registry/*/tests/**/*.test.{ts,tsx}",
    ],
    coverage: {
      provider: "v8",
      reportsDirectory: "./coverage",
      reporter: ["text", "html"],
    },
  },
});
