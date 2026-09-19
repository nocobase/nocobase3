export const apps = [
  {
    name: 'nocobase-app-template-examples',
    script: './dist/server/standalone.js',
    interpreter: 'node',
    env: {
      NODE_ENV: 'production',
    },
  },
];

export default { apps };
