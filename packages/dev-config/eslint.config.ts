import { createNodeLibraryConfig } from "./eslint/index.ts";

export default createNodeLibraryConfig({
  tsconfigRootDir: import.meta.dirname,
  ignores: ["**/*.d.ts"],
});
