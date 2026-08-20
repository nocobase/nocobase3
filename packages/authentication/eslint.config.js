import { createClientLibraryConfig } from "@nocobase/dev-config/eslint";

export default createClientLibraryConfig({
  tsconfigRootDir: import.meta.dirname,
  // UI sources are published registry fragments and are typechecked by their
  // consuming Portal rather than this package's declaration build.
  ignores: ["ui/**"],
  overrides: [
    {
      // Refine's AuthProvider callbacks expose form payloads as any. The
      // adapter normalizes each field before passing it to the typed client.
      files: ["client/auth-provider.ts"],
      rules: {
        "@typescript-eslint/no-unsafe-assignment": "off",
        "@typescript-eslint/no-unsafe-member-access": "off",
      },
    },
    {
      // Better Auth and Knex intentionally exchange dynamic adapter rows and
      // comparison values at this boundary.
      files: ["server/better-auth/database-adapter.ts"],
      rules: {
        "@typescript-eslint/no-unsafe-member-access": "off",
        "@typescript-eslint/no-unsafe-return": "off",
        "@typescript-eslint/restrict-template-expressions": "off",
      },
    },
  ],
});
