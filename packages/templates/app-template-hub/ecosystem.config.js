export const apps = [
  {
    name: 'nocobase-app-template-hub',
    // pm2's fork mode loads a script through its own wrapper, so
    // import.meta.main is false there and standalone.js never starts the
    // server. Running node itself keeps standalone.js the main module.
    script: 'node',
    args: './dist/server/standalone.js',
    // Resolve `args` against this file's directory rather than wherever
    // `pm2 start` runs, so the path to this file can be given from anywhere.
    cwd: import.meta.dirname,
    interpreter: 'none',
    env: {
      NODE_ENV: 'production',
    },
  },
];

export default { apps };
