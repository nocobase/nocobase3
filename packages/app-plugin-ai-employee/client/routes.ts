import { defineSettingsRoutes } from '@nocobase/app-client/plugins';
import { createAISettings } from './ai-settings.js';

export default defineSettingsRoutes([createAISettings()]);
