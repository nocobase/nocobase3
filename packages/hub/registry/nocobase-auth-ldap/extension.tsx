import { lazy } from "react";
import { ContactRound } from "lucide-react";

import type { AppExtension } from "@nocobase/portal-sdk/extensions";
import { defineAppRoutes } from "@nocobase/portal-sdk/routing";

const LdapSignInForm = lazy(() => import("./ldap-sign-in-form"));

const ldapAuthExtension: AppExtension = {
  id: "nocobase-auth-ldap",
  dev: {
    resources: [
      {
        name: "auth-ldap-demo",
        list: "auth/ldap",
        meta: {
          parent: "auth-components",
          label: "LDAP",
          icon: <ContactRound />,
          acl: { type: "authenticated" },
        },
      },
    ],
    routes: defineAppRoutes([
      {
        name: "development.auth.ldap",
        path: "auth/ldap",
        lazy: () =>
          import("./demo").then((module) => ({
            default: module.LdapAuthDemoPage,
          })),
      },
    ]),
  },
  authAdapters: [
    {
      authType: "LDAP",
      placement: "form",
      Component: LdapSignInForm,
    },
  ],
};

export default ldapAuthExtension;
