import {
  defineClientProviders,
  type AppClientProviderDefinition,
} from '@nocobase/app-client/plugins';

const providers: readonly AppClientProviderDefinition[] = defineClientProviders(
  [],
);

export default providers;
