import type { AppPluginProviderConstructor } from '@nocobase/app-server/plugins';
import { UsersProvider } from './provider.js';
const providers: readonly AppPluginProviderConstructor[] = [UsersProvider];
export default providers;
