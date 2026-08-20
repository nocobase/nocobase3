import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { mergeConfig } from "vitest/config";

const reactSetupFile = fileURLToPath(
  new URL("./react-setup.js", import.meta.url),
);
const reactConfig = {
  plugins: [react()],
  test: {
    environment: "jsdom",
    exclude: ["**/node_modules/**", "**/dist/**", "**/build/**"],
    setupFiles: [reactSetupFile],
  },
};

export const createReactVitestConfig = (localConfig = {}) =>
  mergeConfig(reactConfig, localConfig);
