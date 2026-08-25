import { createClientLibraryConfig } from '@nocobase/dev-config/eslint';

export default createClientLibraryConfig({
  tsconfigRootDir: import.meta.dirname,
  overrides: [
    {
      name: 'hub-release-management/initial-load-effect',
      files: ['client/use-release-management.ts'],
      rules: {
        // The effect owns an abortable request and refresh updates state only
        // after the asynchronous control-plane response settles.
        'react-hooks/set-state-in-effect': 'off',
      },
    },
  ],
});
