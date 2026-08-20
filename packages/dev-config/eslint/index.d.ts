import type { Linter } from "eslint";

export interface SharedConfigOptions {
  tsconfigRootDir?: string;
  ignores?: string[];
  rules?: Linter.Config["rules"];
  overrides?: Linter.Config[];
  environment?: Linter.Config[];
}

export declare const base: Linter.Config[];
export declare const typescript: Linter.Config[];
export declare const typeChecked: Linter.Config[];
export declare const node: Linter.Config[];
export declare const react: Linter.Config[];
export declare const vitest: Linter.Config[];

export declare const createNodeLibraryConfig: (
  options?: SharedConfigOptions,
) => Linter.Config[];

export declare const createClientLibraryConfig: (
  options?: SharedConfigOptions,
) => Linter.Config[];

export declare const createPortalConfig: (
  options?: SharedConfigOptions,
) => Linter.Config[];
