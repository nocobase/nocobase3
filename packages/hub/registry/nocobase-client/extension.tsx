import type { AppExtension } from "@nocobase/portal-sdk/extensions";
import { defineAppRoutes } from "@nocobase/portal-sdk/routing";
import { Blocks, ListFilter } from "lucide-react";

const nocobaseClientExtension: AppExtension = {
  id: "nocobase-client",
  dev: {
    resources: [
      {
        name: "client-components",
        meta: {
          label: "Client components",
          icon: <Blocks />,
          description: "Reusable Portal client-side interaction patterns.",
        },
      },
      {
        name: "client-remote-select",
        list: "client/remote-select",
        meta: {
          parent: "client-components",
          label: "Remote select",
          icon: <ListFilter />,
          description: "Searchable, paginated selection from a remote loader.",
          acl: { type: "authenticated" },
        },
      },
    ],
    routes: defineAppRoutes([
      {
        name: "development.client.remote-select",
        path: "client/remote-select",
        lazy: () => import("./demo"),
      },
    ]),
  },
};

export default nocobaseClientExtension;
