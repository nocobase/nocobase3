import fs from "node:fs";
import { fileURLToPath } from "node:url";

import { createReactVitestConfig } from "@nocobase/dev-config/vitest/react";

const root = fileURLToPath(new URL(".", import.meta.url));
const registryRoot = fileURLToPath(new URL("./registry", import.meta.url));
const extensionsRoot = fs.existsSync(registryRoot)
  ? registryRoot
  : fileURLToPath(new URL("./client/extensions", import.meta.url));

export default createReactVitestConfig({
  resolve: {
    alias: [
      {
        find: "@/jobs",
        replacement: fileURLToPath(new URL("./server/jobs", import.meta.url)),
      },
      {
        find: "@/services",
        replacement: fileURLToPath(
          new URL("./server/services", import.meta.url),
        ),
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
