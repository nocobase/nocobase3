import type { AppExtension } from "@nocobase/portal-sdk/extensions";
import { defineAppRoutes } from "@nocobase/portal-sdk/routing";
import { Languages } from "lucide-react";
import { LanguageUserMenuItems } from "./components";
import "./locales";
import { NocoBaseI18nBootstrap } from "./provider";

const nocobaseI18nExtension: AppExtension = {
  id: "nocobase-i18n",
  Provider: NocoBaseI18nBootstrap,
  UserMenuItems: LanguageUserMenuItems,
  dev: {
    resources: [
      {
        name: "i18n-demo",
        list: "i18n",
        meta: {
          label: "Internationalization",
          i18nKey: "navigation.demo",
          i18nOptions: { ns: "nocobase-i18n" },
          icon: <Languages />,
          description:
            "Optional frontend internationalization for the Starter.",
          acl: { type: "authenticated" },
        },
      },
    ],
    routes: defineAppRoutes([
      {
        name: "development.i18n",
        path: "i18n",
        lazy: () =>
          import("./demo").then((module) => ({
            default: module.I18nDemoPage,
          })),
      },
    ]),
  },
};

export default nocobaseI18nExtension;
