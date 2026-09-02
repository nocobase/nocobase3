import enUS from './en-US.js';
import zhCN from './zh-CN.js';

export const NOCOBASE_AI_I18N_NAMESPACE = 'nocobase-ai';

export const nocobaseAILocales = {
  'en-US': enUS,
  'zh-CN': zhCN,
} as const;

export type NocoBaseAITranslationKey = keyof typeof enUS;
