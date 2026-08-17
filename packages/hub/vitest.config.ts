import fs from "node:fs";
import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL(".", import.meta.url));
const registryRoot = fileURLToPath(new URL("./registry", import.meta.url));
const extensionsRoot = fs.existsSync(registryRoot)
  ? registryRoot
  : fileURLToPath(new URL("./client/extensions", import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@/extensions": extensionsRoot,
      "@": fileURLToPath(new URL("./client", import.meta.url)),
    },
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
