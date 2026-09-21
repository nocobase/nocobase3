import path from 'node:path';
import { defineServerPlugin, type AppServerPlugin } from '@nocobase/app-server/plugins';
import serviceProviders from './providers.js';
const users: AppServerPlugin = defineServerPlugin({ baseDir: path.resolve(import.meta.dirname, '..'), packageName: '@nocobase/app-plugin-users', serviceProviders });
export default users;
