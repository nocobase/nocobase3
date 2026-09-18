import { expectTypeOf, it } from 'vitest';
import type {
  AppServerInspectionIssue,
  AppServerInspectionSnapshot,
  AppServerPlugin,
  AppServerPluginDefinition,
  AppServerPluginSnapshot,
  ResolvedAppPlugin,
} from '../../src/plugins/index.js';
import { defineServerPlugin } from '../../src/plugins/index.js';

// @ts-expect-error the legacy contribution is no longer a public plugin type
import type { AppServerPluginQueueContribution } from '../../src/plugins/index.js';
// @ts-expect-error the legacy snapshot is no longer a public plugin type
import type { AppServerJobsSnapshot } from '../../src/plugins/index.js';
// @ts-expect-error the root entry must not re-export the legacy contribution
import type { AppServerPluginQueueContribution as RootQueueContribution } from '../../src/index.js';
// @ts-expect-error the root entry must not re-export the legacy snapshot
import type { AppServerJobsSnapshot as RootJobsSnapshot } from '../../src/index.js';

it('exposes only supported plugin metadata', () => {
  const retiredImports = (
    ..._types: [
      AppServerPluginQueueContribution,
      AppServerJobsSnapshot,
      RootQueueContribution,
      RootJobsSnapshot,
    ]
  ): void => {};
  void retiredImports;
  expectTypeOf<
    Extract<'queue', keyof AppServerPluginDefinition>
  >().toEqualTypeOf<never>();
  expectTypeOf<
    Extract<'queue', keyof AppServerPlugin>
  >().toEqualTypeOf<never>();
  expectTypeOf<
    Extract<'jobLocations', keyof ResolvedAppPlugin>
  >().toEqualTypeOf<never>();
  expectTypeOf<
    Extract<'jobs', keyof AppServerInspectionSnapshot>
  >().toEqualTypeOf<never>();
  expectTypeOf<
    Extract<'jobLocations', keyof AppServerPluginSnapshot['contributions']>
  >().toEqualTypeOf<never>();
  expectTypeOf<AppServerInspectionIssue['code']>().toEqualTypeOf<
    'SERVER_MIGRATIONS_DIRECTORY_MISSING' | 'SERVER_SEEDS_DIRECTORY_MISSING'
  >();

  const invalid = () => {
    defineServerPlugin({
      packageName: '@nocobase/test',
      // @ts-expect-error register queue handlers through serviceProviders instead
      queue: { jobs: ['./jobs'] },
    });
    const definition: AppServerPluginDefinition = {
      packageName: '@nocobase/test',
      // @ts-expect-error even an empty legacy contribution is unsupported
      queue: {},
    };
    const plugin: AppServerPlugin = {
      packageName: '@nocobase/test',
      serviceProviders: [],
      routes: [],
      // @ts-expect-error normalized plugins no longer expose queue metadata
      queue: { jobs: [] },
    };
    void [definition, plugin];
  };
  void invalid;
});
