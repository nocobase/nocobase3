import { Authenticated } from "@refinedev/core";
import { CatchAllNavigate } from "@refinedev/react-router";
import { Outlet, Route, Routes } from "react-router";

import { AclBootstrap } from "@/components/access-control/acl-bootstrap";
import { NavigateToAccessibleResource } from "@/components/access-control/navigate-to-accessible-resource";
import { ErrorComponent } from "@/components/app-shell/error-component";
import { Layout } from "@/components/app-shell/layout";
import { ForgotPassword } from "@/pages/forgot-password";
import { Login } from "@/pages/login";
import { Register } from "@/pages/register";
import {
  AppExtensionProviders,
  configuredRouteElements,
  extensionStandaloneRouteElements,
} from "./extensions";

export function AppRoutes() {
  return (
    <Routes>
      <Route
        element={
          <Authenticated
            key="authenticated-inner"
            fallback={<CatchAllNavigate to="/login" />}
          >
            <AclBootstrap>
              <AppExtensionProviders>
                <Outlet />
              </AppExtensionProviders>
            </AclBootstrap>
          </Authenticated>
        }
      >
        {extensionStandaloneRouteElements}
        <Route
          element={
            <Layout>
              <Outlet />
            </Layout>
          }
        >
          <Route index element={<NavigateToAccessibleResource />} />
          {configuredRouteElements}
          <Route path="*" element={<ErrorComponent />} />
        </Route>
      </Route>

      <Route
        element={
          <Authenticated key="authenticated-outer" fallback={<Outlet />}>
            <AclBootstrap>
              <NavigateToAccessibleResource />
            </AclBootstrap>
          </Authenticated>
        }
      >
        <Route path="/login" element={<Login />} />
        <Route path="/signin" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
      </Route>
    </Routes>
  );
}
