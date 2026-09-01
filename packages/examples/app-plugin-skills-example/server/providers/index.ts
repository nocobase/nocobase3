import type { AppPluginProviderConstructor } from '@nocobase/app-server/plugins';

import { SkillsExampleProvider } from './skills-example.js';

const serviceProviders: readonly AppPluginProviderConstructor[] = [
  SkillsExampleProvider,
];

export default serviceProviders;
