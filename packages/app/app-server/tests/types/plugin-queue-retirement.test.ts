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
  // A retired declaration still compiles, so a plugin built against it keeps building; it carries no typed shape.
  expectTypeOf<AppServerPluginDefinition['queue']>().toEqualTypeOf<unknown>();
  expectTypeOf<AppServerPlugin['queue']>().toEqualTypeOf<unknown>();
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
    | 'SERVER_MIGRATIONS_DIRECTORY_MISSING'
    | 'SERVER_SEEDS_DIRECTORY_MISSING'
    | 'SERVER_QUEUE_JOBS_RETIRED'
  >();

  const legacy = () => {
    defineServerPlugin({
      packageName: '@nocobase/test',
      baseDir: '/unused',
      queue: { jobs: ['./jobs'] },
    });
    const plugin: AppServerPlugin = {
      packageName: '@nocobase/test',
      baseDir: '/unused',
      serviceProviders: [],
      routes: [],
      queue: { jobs: [] },
    };
    void plugin;
  };
  void legacy;
});
