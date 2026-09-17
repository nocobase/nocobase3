import { createNodeLibraryConfig } from '@nocobase/dev-config/eslint';

export default createNodeLibraryConfig({
  rules: {
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: ['@nocobase/db-*'],
            message:
              'Shared database contracts receive a dialect adapter from their caller; they must not import a dialect package.',
          },
        ],
      },
    ],
  },
});
