import path from "node:path";

import type { ConfigPaths } from "./types.js";

export interface CreateConfigPathsOptions {
  rootDir: string;
  serverDir?: string;
  databaseDir?: string;
  configDir?: string;
  storageDir?: string;
}

export function createConfigPaths(
  options: CreateConfigPathsOptions,
): ConfigPaths {
  const rootDir = path.resolve(options.rootDir);
  const serverDir = path.resolve(
    options.serverDir ?? path.join(rootDir, "server"),
  );
  const databaseDir = path.resolve(
    options.databaseDir ?? path.join(rootDir, "database"),
  );
  const configDir = path.resolve(
    options.configDir ?? path.join(serverDir, "config"),
  );
  const storageDir = path.resolve(
    options.storageDir ?? path.join(rootDir, "storage"),
  );

  return {
    root: (pathInside = "") => resolveInside(rootDir, pathInside),
    server: (pathInside = "") => resolveInside(serverDir, pathInside),
    database: (pathInside = "") => resolveInside(databaseDir, pathInside),
    config: (pathInside = "") => resolveInside(configDir, pathInside),
    storage: (pathInside = "") => resolveInside(storageDir, pathInside),
  };
}

function resolveInside(rootDir: string, pathInside: string): string {
  return path.resolve(rootDir, pathInside);
}
