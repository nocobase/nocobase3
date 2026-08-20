import { createNodeVitestConfig } from "@nocobase/dev-config/vitest/node";

export default createNodeVitestConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/**/*.ts"],
      exclude: [
        "dist/**",
        "test/**",
        "src/**/index.ts",
        "src/**/types.ts",
        "src/database/connection.ts",
        "src/database/drivers/knex/config.ts",
        "src/metadata/store.ts",
        "src/naming/strategy.ts",
      ],
    },
  },
});
