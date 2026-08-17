import type { AppExtension } from "@nocobase/portal-sdk/extensions";
import { defineAppRoutes } from "@nocobase/portal-sdk/routing";
import { ShieldAlert } from "lucide-react";

const errorBoundaryExtension: AppExtension = {
  id: "nocobase-error-boundary",
  dev: {
    resources: [
      {
        name: "error-boundary",
        list: "error-boundary",
        meta: {
          label: "Error boundaries",
          icon: <ShieldAlert />,
          description: "Render boundaries and NocoBase runtime status patterns.",
          acl: { type: "authenticated" },
        },
      },
    ],
    routes: defineAppRoutes([
      {
        name: "development.error-boundary",
        path: "error-boundary",
        lazy: () => import("./demo"),
      },
    ]),
  },
};

export default errorBoundaryExtension;
