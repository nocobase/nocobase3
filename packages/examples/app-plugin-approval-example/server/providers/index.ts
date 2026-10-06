import type { AppPluginProviderConstructor } from '@nocobase/app-server/plugins';

import { ApprovalExampleProvider } from './approval-example.js';

const serviceProviders: readonly AppPluginProviderConstructor[] = [
  ApprovalExampleProvider,
];

export default serviceProviders;
