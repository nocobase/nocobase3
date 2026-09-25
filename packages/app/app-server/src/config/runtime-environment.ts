export interface RuntimeEnvironmentVariable {
  readonly name: string;
  readonly description: string;
}

/**
 * Environment variables the runtime reads itself rather than through a section's `env`. With the sections'
 * declarations they are everything an application can be configured with from its environment, which is what
 * `pnpm config:env` lists and what `.env.example` may name.
 */
export const RUNTIME_ENVIRONMENT_VARIABLES: readonly RuntimeEnvironmentVariable[] =
  [
    {
      name: 'APP_BASE_PATH',
      description:
        'The path the application is served under; its name follows from it.',
    },
    {
      name: 'APP_CONFIG_FILE',
      description:
        'The configuration file to read instead of config.yml in the deployment root.',
    },
    {
      name: 'NOCOBASE_STRICT_STARTUP',
      description: 'Set to true to exit the process as soon as startup fails.',
    },
  ];
