import type { ViteUserConfig } from "vitest/config";
import { mergeConfig } from "vitest/config";

const nodeConfig: ViteUserConfig = {
  test: {
    environment: "node",
    exclude: ["**/node_modules/**", "**/dist/**", "**/build/**"],
  },
};

export const createNodeVitestConfig: (
  localConfig?: ViteUserConfig,
) => ViteUserConfig = (localConfig = {}) =>
  mergeConfig(nodeConfig, localConfig);
