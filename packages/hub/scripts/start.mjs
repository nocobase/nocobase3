process.env.NODE_ENV ||= 'production';

try {
  const { startServer } = await import('../dist/server/standalone.js');
  startServer();
} catch (error) {
  if (error?.code === 'ERR_MODULE_NOT_FOUND') {
    console.error('Missing dist/server/standalone.js. Run pnpm build first.');
    process.exit(1);
  }

  throw error;
}
