import { createClientLibraryConfig } from '@nocobase/dev-config/eslint';

export default createClientLibraryConfig({
  tsconfigRootDir: import.meta.dirname,
  overrides: [
    {
      // The preview's shadcn primitives stay as `shadcn add` generated them, so the rules the Portal configuration
      // relaxes for an application's `client/components/ui/` are relaxed for the same files here. The registry
      // sources and the rest of the preview are held to the full rule set.
      name: 'ui-library/shadcn-primitives',
      files: ['website/components/ui/**/*.tsx', 'website/hooks/use-mobile.ts'],
      rules: {
        'react-refresh/only-export-components': 'off',
        'react-hooks/set-state-in-effect': 'off',
        '@eslint-react/set-state-in-effect': 'off',
        '@eslint-react/no-nested-component-definitions': 'off',
        '@eslint-react/no-array-index-key': 'off',
        '@eslint-react/dom-no-dangerously-set-innerhtml': 'off',
        '@eslint-react/use-state': 'off',
      },
    },
  ],
});
