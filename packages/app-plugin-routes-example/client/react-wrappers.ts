import {
  defineClientReactWrappers,
  type AppClientReactWrapperDefinition,
} from '@nocobase/app-client/plugins';

import { RoutesExampleProvider } from './components/routes-example-provider.js';

export const reactWrappers: readonly AppClientReactWrapperDefinition[] =
  defineClientReactWrappers([
    {
      name: 'routes-example',
      component: RoutesExampleProvider,
    },
  ]);

export default reactWrappers;
