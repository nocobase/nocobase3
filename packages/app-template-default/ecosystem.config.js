export const apps = [
  {
    name: 'nocobase-app-template-default',
    script: './dist/server/standalone.js',
    interpreter: 'node',
    env: {
      NODE_ENV: 'production',
    },
  },
];

export default { apps };
