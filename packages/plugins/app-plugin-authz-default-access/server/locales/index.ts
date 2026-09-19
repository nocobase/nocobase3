import type { LocaleLoaders } from '@nocobase/i18n';

// One dynamic import per locale, so a server loads only the language it answers in.
const locales: LocaleLoaders = {
  'en-US': () => import('./en-US.js'),
  'zh-CN': () => import('./zh-CN.js'),
};

export default locales;
