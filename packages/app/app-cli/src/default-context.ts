import { stat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { resolveStandaloneAppRuntime } from '@nocobase/app-server/node';
import type { AppRuntimeDefinition } from '@nocobase/app-server/runtime';
import type { AppCommandContext } from './context.js';
import type { AppCommandsOptions } from './index.js';

/** Load by convention only when a command actually needs the application. */
export function createDefaultCommandContext(
  options: AppCommandsOptions,
): AppCommandContext {
  const rootDir = path.resolve(options.rootDir);
  return {
    rootDir,
    loadRuntime:
      options.loadRuntime ??
      (async () => {
        const url = await resolveServerModule(rootDir, 'runtime');
        const module = (await import(url)) as {
          default?: AppRuntimeDefinition;
        };
        if (!module.default || typeof module.default !== 'object') {
          throw new Error(
            `Application runtime module "${url}" must have a default runtime export.`,
          );
        }
        return resolveStandaloneAppRuntime(module.default, { rootDir });
      }),
    createApp:
      options.createApp ??
      (async (runtime) => {
        const url = await resolveServerModule(rootDir, 'app');
        const module = (await import(url)) as {
          createApp?: AppCommandContext['createApp'];
        };
        if (typeof module.createApp !== 'function') {
          throw new Error(
            `Application module "${url}" must export createApp(runtime).`,
          );
        }
        return module.createApp(runtime);
      }),
  };
}

async function resolveServerModule(
  rootDir: string,
  name: string,
): Promise<string> {
  // Source checkouts prefer TypeScript; deployment roots contain JavaScript only.
  for (const extension of ['ts', 'js']) {
    const filename = path.join(rootDir, 'server', `${name}.${extension}`);
    try {
      if ((await stat(filename)).isFile()) return pathToFileURL(filename).href;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  throw new Error(
    `Application module not found: ${path.join(rootDir, 'server', name)}.{ts,js}`,
  );
}
