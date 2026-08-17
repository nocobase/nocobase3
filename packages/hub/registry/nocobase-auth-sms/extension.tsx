import { lazy } from "react";
import { Smartphone } from "lucide-react";

import type { AppExtension } from "@nocobase/portal-sdk/extensions";
import { defineAppRoutes } from "@nocobase/portal-sdk/routing";

const SmsSignInForm = lazy(() => import("./sms-sign-in-form"));

const smsAuthExtension: AppExtension = {
  id: "nocobase-auth-sms",
  dev: {
    resources: [
      {
        name: "auth-sms-demo",
        list: "auth/sms",
        meta: {
          parent: "auth-components",
          label: "SMS",
          icon: <Smartphone />,
          acl: { type: "authenticated" },
        },
      },
    ],
    routes: defineAppRoutes([
      {
        name: "development.auth.sms",
        path: "auth/sms",
        lazy: () =>
          import("./demo").then((module) => ({
            default: module.SmsAuthDemoPage,
          })),
      },
    ]),
  },
  authAdapters: [
    {
      authType: "SMS",
      placement: "form",
      Component: SmsSignInForm,
    },
  ],
};

export default smsAuthExtension;
