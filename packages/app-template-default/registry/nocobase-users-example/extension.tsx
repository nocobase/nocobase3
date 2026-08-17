import type { AppExtension } from "@nocobase/portal-sdk/extensions";
import { usersExampleRoutes } from "./app-routes";
import "./locales";

const usersExampleExtension: AppExtension = {
  id: "nocobase-users-example",
  priority: 0,
  routes: usersExampleRoutes,
};

export default usersExampleExtension;
