export { dataProvider } from './data-provider.js';
export { registerAppDataSourceSettingsModule } from './bootstrap.js';
export {
  APP_DATA_SOURCE_SETTINGS_SERVICE,
  configureAppDataSourceSettings,
  getAppDataSourceSettings,
} from './settings-configuration.js';
export type {
  AppDataSourceCollection,
  AppDataSourceCollectionInput,
  AppDataSourceSettings,
  AppDataSourceSettingsInput,
} from './settings-configuration.js';
export { default as AppDataSourceSettingsPage } from './settings-page.js';
