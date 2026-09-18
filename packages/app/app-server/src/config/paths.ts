import path from 'node:path';

export interface AppPathOptions {
  readonly rootDir: string;
  readonly deploymentRootDir?: string;
  readonly serverDir?: string;
  readonly databaseDir?: string;
  readonly clientDir?: string;
  readonly configDir?: string;
  readonly storageDir?: string;
}

export interface AppPaths {
  readonly rootDir: string;
  readonly deploymentRootDir: string;
  readonly serverDir: string;
  readonly databaseDir: string;
  readonly clientDir: string;
  readonly configDir: string;
  readonly storageDir: string;
  root(relativePath?: string): string;
  server(relativePath?: string): string;
  database(relativePath?: string): string;
  client(relativePath?: string): string;
  config(relativePath?: string): string;
  storage(relativePath?: string): string;
}

/** Resolve directory inputs once; all application consumers share this object. */
export function createAppPaths(options: AppPathOptions): AppPaths {
  const rootDir = path.resolve(options.rootDir);
  const deploymentRootDir = path.resolve(
    rootDir,
    options.deploymentRootDir ?? '.',
  );
  const serverDir = path.resolve(rootDir, options.serverDir ?? 'server');
  const databaseDir = path.resolve(rootDir, options.databaseDir ?? 'database');
  const clientDir = path.resolve(rootDir, options.clientDir ?? 'client');
  const configDir = path.resolve(serverDir, options.configDir ?? 'config');
  const storageDir = path.resolve(
    deploymentRootDir,
    options.storageDir ?? 'storage',
  );
  return Object.freeze({
    rootDir,
    deploymentRootDir,
    serverDir,
    databaseDir,
    clientDir,
    configDir,
    storageDir,
    root: (relativePath = '') => path.resolve(rootDir, relativePath),
    server: (relativePath = '') => path.resolve(serverDir, relativePath),
    database: (relativePath = '') => path.resolve(databaseDir, relativePath),
    client: (relativePath = '') => path.resolve(clientDir, relativePath),
    config: (relativePath = '') => path.resolve(configDir, relativePath),
    storage: (relativePath = '') => path.resolve(storageDir, relativePath),
  });
}
