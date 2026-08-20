import { mergeConfig } from "vitest/config";

const nodeConfig = {
  test: {
    environment: "node",
    exclude: ["**/node_modules/**", "**/dist/**", "**/build/**"],
  },
};

export const createNodeVitestConfig = (localConfig = {}) =>
  mergeConfig(nodeConfig, localConfig);
