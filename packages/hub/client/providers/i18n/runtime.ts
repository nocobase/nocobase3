import { configurePortalI18n } from "@nocobase/portal-sdk/i18n";

export const portalI18nReady = configurePortalI18n({
  defaultLocale: "en-US",
  locales: [
    { locale: "en-US", label: "English", direction: "ltr" },
    { locale: "zh-CN", label: "简体中文", direction: "ltr" },
  ],
  initOptions: {
    defaultNS: "starter",
    fallbackNS: "starter",
  },
  onLocaleChanged: () => {
    if (typeof window !== "undefined") window.location.reload();
  },
});
