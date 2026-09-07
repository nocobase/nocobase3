import type { LocaleLoaders } from '@nocobase/i18n';
const locales: LocaleLoaders = {
  'en-US': async () => ({
    default: {
      ...(await import('../events/en-US.js')).default,
      ...(await import('./en-US.js')).default,
    },
  }),
  'zh-CN': async () => ({
    default: {
      ...(await import('../events/zh-CN.js')).default,
      ...(await import('./zh-CN.js')).default,
    },
  }),
};
export default locales;
