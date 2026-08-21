import { createNodeVitestConfig } from "@nocobase/dev-config/vitest/node";

export default createNodeVitestConfig({ test: { passWithNoTests: true } });
