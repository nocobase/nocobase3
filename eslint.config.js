import {
  base,
  createClientLibraryConfig,
  createNodeLibraryConfig,
  createPortalConfig,
  node,
  typescript,
} from '@nocobase/dev-config/eslint';

const supportedFiles = ['**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}'];
const rootNodeFiles = [
  '*.{js,mjs,cjs}',
  '.github/**/*.{js,mjs,cjs}',
  'scripts/**/*.{js,mjs,cjs}',
  'tools/**/*.{js,mjs,cjs}',
];
const nodeLibraryRoots = [
  'packages/app-server-kit',
  'packages/authorization',
  'packages/caching',
  'packages/app-database',
  'packages/drive',
  'packages/app-host',
  'packages/id-generator',
  'packages/logging',
  'packages/queue',
  'packages/session',
];
const devConfigRoots = ['packages/dev-config'];
const clientLibraryRoots = ['packages/app-sdk', 'packages/app-portal-sdk'];
const portalRoots = ['packages/app-template-default', 'packages/hub'];
const prefixPatterns = (roots, patterns) =>
  roots.flatMap((root) => patterns.map((pattern) => `${root}/${pattern}`));

const scopePackageConfigs = (configs, roots, namespace, unignores = []) =>
  configs.map((config, index) => {
    const name = `root/${namespace}/${config.name ?? index + 1}`;

    if (config.ignores && !config.files) {
      return {
        ...config,
        name,
        ignores: [...prefixPatterns(roots, config.ignores), ...unignores],
      };
    }

    return {
      ...config,
      name,
      files: prefixPatterns(roots, config.files ?? supportedFiles),
    };
  });

const scopeRootNodeConfigs = (configs) =>
  configs.map((config, index) => ({
    ...config,
    name: `root/node-tooling/${config.name ?? index + 1}`,
    files: rootNodeFiles,
  }));

export default [
  ...scopeRootNodeConfigs([...base, ...node]),
  ...scopePackageConfigs(
    createNodeLibraryConfig({
      tsconfigRootDir: import.meta.dirname,
    }),
    nodeLibraryRoots,
    'node-libraries',
  ),
  ...scopePackageConfigs(
    [...base, ...typescript, ...node],
    devConfigRoots,
    'dev-config',
  ),
  ...scopePackageConfigs(
    createClientLibraryConfig({
      tsconfigRootDir: import.meta.dirname,
    }),
    clientLibraryRoots,
    'client-libraries',
  ),
  ...scopePackageConfigs(
    createClientLibraryConfig({
      tsconfigRootDir: import.meta.dirname,
      ignores: ['ui/**'],
    }),
    ['packages/app-plugin-authentication'],
    'app-plugin-authentication',
  ),
  ...scopePackageConfigs(
    createPortalConfig({
      tsconfigRootDir: import.meta.dirname,
      ignores: [
        '.extension-state/**',
        'public/r/**',
        'public/storage/**',
        'src/extensions/**',
        'storage/**',
      ],
    }),
    portalRoots,
    'portals',
  ),
];
