export const apps = [
  {
    name: "nocobase-app-template-default",
    script: "./scripts/start.mjs",
    interpreter: "node",
    env: {
      NODE_ENV: "production",
    },
  },
];

export default { apps };
