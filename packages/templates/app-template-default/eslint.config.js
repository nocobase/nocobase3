import { createPortalConfig } from '@nocobase/dev-config/eslint';

export default createPortalConfig({
  tsconfigRootDir: import.meta.dirname,
  ignores: [
    '.extension-state/**',
    'client-old/**',
    'public/r/**',
    'storage/**',
  ],
  overrides: [
    {
      // `client/components/ui/` and `client/hooks/use-mobile.ts` are shadcn/ui
      // registry output added with `pnpm exec shadcn add`. The primitives
      // export their `cva` variants, contexts and hooks alongside components
      // by design, and a few compose state the way the upstream source does.
      // Keep them as the registry emits them so `shadcn add <name> --diff`
      // stays meaningful; hand-written components in `client/components/`
      // are still held to the full rule set.
      name: 'shadcn-ui',
      files: ['client/components/ui/**/*.tsx', 'client/hooks/use-mobile.ts'],
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
    {
      // Recharts exposes loosely typed tooltip and legend payloads; the
      // upstream chart wrapper reads them as-is.
      name: 'shadcn-ui-chart',
      files: ['client/components/ui/chart.tsx'],
      rules: {
        '@typescript-eslint/no-unsafe-assignment': 'off',
        '@typescript-eslint/no-unsafe-member-access': 'off',
        '@typescript-eslint/no-unsafe-argument': 'off',
        '@typescript-eslint/restrict-template-expressions': 'off',
      },
    },
  ],
});
