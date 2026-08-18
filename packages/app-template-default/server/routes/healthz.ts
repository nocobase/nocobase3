import type { Handler } from 'hono';

export interface HealthzHandlerOptions {
  appName: string;
  publicBasePath: string;
}

export function createHealthzHandler(options: HealthzHandlerOptions): Handler {
  return (c) =>
    c.json({
      ok: true,
      app: {
        name: options.appName,
        basePath: options.publicBasePath,
      },
      basePath: options.publicBasePath,
    });
}
