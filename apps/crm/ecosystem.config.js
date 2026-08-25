export const apps = [
  {
    name: 'nocobase-crm',
    script: './scripts/start.mjs',
    interpreter: 'node',
    env: {
      NODE_ENV: 'production',
    },
  },
];

export default { apps };
