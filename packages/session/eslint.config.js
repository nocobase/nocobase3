import { createNodeLibraryConfig } from "@nocobase/dev-config/eslint";

export default createNodeLibraryConfig({
  tsconfigRootDir: import.meta.dirname,
  overrides: [
    {
      // unstorage's driver subpath declarations are not visible to the
      // project service, although the package passes TypeScript typecheck.
      files: ["src/stores.ts"],
      rules: {
        "@typescript-eslint/no-unsafe-assignment": "off",
      },
    },
  ],
});
