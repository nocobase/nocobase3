import {
  createClientLibraryConfig,
  createShadcnRegistryConfig,
} from '@nocobase/dev-config/eslint';

export default createClientLibraryConfig({
  tsconfigRootDir: import.meta.dirname,
  // The preview's shadcn primitives stay as `shadcn add` generated them, so they get the relaxations the Portal
  // configuration gives an application's `client/components/ui/`, scoped to `website/`. The registry sources and the
  // rest of the preview are held to the full rule set.
  environment: createShadcnRegistryConfig('website'),
});
