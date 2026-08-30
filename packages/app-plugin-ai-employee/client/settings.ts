import {
  defineClientSettings,
  type AppClientSettingDefinition,
} from '@nocobase/app-client/plugins';
import { createAISettings } from './ai-settings.js';

export default function settings(): readonly AppClientSettingDefinition[] {
  return defineClientSettings(createAISettings());
}
