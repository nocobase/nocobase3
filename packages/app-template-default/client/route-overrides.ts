import {
  defineClientRouteComponentOverrides,
  type AppClientRouteComponentOverrideDefinition,
} from '@nocobase/app-client/plugins';

import authenticationPageOverrides from './auth/page-overrides';

export const routeComponentOverrides: readonly AppClientRouteComponentOverrideDefinition[] =
  defineClientRouteComponentOverrides([...authenticationPageOverrides]);

export default routeComponentOverrides;
