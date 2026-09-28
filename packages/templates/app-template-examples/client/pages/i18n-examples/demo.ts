import { I18nRuntime, type PartialLocaleResource } from '@nocobase/i18n';

const namespace = '@nocobase/i18n-example-fixture';

// Deliberately incomplete teaching resources. Keep the application's own locales complete.
const enUS = {
  translated: 'Your changes are saved.',
  englishOnly: 'This message is available in English only.',
};
const zhCN: PartialLocaleResource<typeof enUS> = {
  translated: '更改已保存。',
};

export async function createFallbackDemo(
  locale: string,
  defaultLocale: string,
  defaultValue: string,
) {
  // This instance never mounts a Provider or changes the application's language or resources.
  const runtime = new I18nRuntime({
    defaultLocale,
    locales: [locale, defaultLocale, 'en-US', 'zh-CN'],
    applicationNamespace: namespace,
  });
  runtime.registerApplicationNamespace(namespace, {
    'en-US': () => Promise.resolve({ default: enUS }),
    'zh-CN': () => Promise.resolve({ default: zhCN }),
  });
  await runtime.init(locale);

  const scenarios = [
    { id: 'translated', key: 'translated' },
    { id: 'englishOnly', key: 'englishOnly' },
    { id: 'withDefault', key: 'missingMessage', defaultValue },
    { id: 'withoutDefault', key: 'missingMessage' },
  ] as const;

  return scenarios.map((scenario) => {
    const options = {
      ns: namespace,
      ...('defaultValue' in scenario
        ? { defaultValue: scenario.defaultValue }
        : {}),
    };
    const result = runtime.i18n.t(scenario.key, {
      ...options,
      returnDetails: true,
    });
    return {
      id: scenario.id,
      key: scenario.key,
      text: result.res,
      source: runtime.i18n.exists(scenario.key, options)
        ? result.usedLng
        : 'defaultValue' in scenario
          ? 'defaultValue'
          : 'key',
    };
  });
}

export const formatSample = {
  value: 1234567.89,
  currency: 'USD',
  date: '2026-09-23T14:05:00.000Z',
  timeZone: 'UTC',
} as const;

export function formatRegion(locale: string) {
  return {
    locale,
    number: new Intl.NumberFormat(locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(formatSample.value),
    currency: new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: formatSample.currency,
    }).format(formatSample.value),
    date: new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: formatSample.timeZone,
    }).format(new Date(formatSample.date)),
  };
}
