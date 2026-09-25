import path from 'node:path';
import { pathToFileURL } from 'node:url';
process.env.NODE_ENV ||= 'production';

try {
  const { startServer } = await import(
    pathToFileURL(
      path.join(
        process.env.NOCOBASE_TOOL_ROOT || process.cwd(),
        'dist/server/standalone.js',
      ),
    ).href
  );
  startServer();
} catch (error) {
  if (error?.code === 'ERR_MODULE_NOT_FOUND') {
    console.error('Missing dist/server/standalone.js. Run pnpm build first.');
    process.exit(1);
  }

  throw error;
}
