import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { evaluateAccess } from "../dist/acl/index.js";
import {
  buildRouteLocationHref,
  buildRouteResources,
  createRouteSurfaceNavigationState,
  defineAppRoutes,
  renderAppRoutes,
  resolveRouteSurfaceCloseTo,
} from "../dist/routing/index.js";
import {
  configurePortalI18n,
  registerTranslationResources,
  translate,
} from "../dist/i18n/index.js";
import { loadSystemSettings } from "../dist/system-settings/index.js";

it("published ACL and routing entry points are executable in Node", () => {
  expect(
    evaluateAccess(
      { allowAll: true, roles: [] },
      { resource: "users", action: "list" }
    )
  ).toBe(true);

  const routes = defineAppRoutes([
    {
      name: "users",
      path: "/users",
      resource: { meta: { label: "Users" } },
      children: [
        { name: "users-create", path: "create", resourceAction: "create" },
      ],
    },
  ]);
  const resources = buildRouteResources(routes);
  expect(resources[0].list).toBe("/users");
  expect(resources[0].create).toBe("/users/create");

  const location = {
    pathname: "/customers",
    search: "?page=2",
    hash: "#renewal",
    state: { activeTab: "mine" },
  };
  expect(buildRouteLocationHref(location)).toBe(
    "/customers?page=2#renewal"
  );
  expect(createRouteSurfaceNavigationState(location)).toEqual({
    activeTab: "mine",
    routeSurfaceReturnTo: "/customers?page=2#renewal",
  });
  expect(
    resolveRouteSurfaceCloseTo(
      { routeSurfaceReturnTo: "/customers?page=2" },
      { pathname: "/customers" }
    )
  ).toBe("/customers?page=2");
});

it("published i18n and System Settings entry points are executable", async () => {
  registerTranslationResources("test", {
    "en-US": { greeting: "Hello" },
  });
  await configurePortalI18n({
    defaultLocale: "en-US",
    locales: [{ locale: "en-US", label: "English" }],
    initOptions: { defaultNS: "test", initImmediate: true },
  });

  expect(translate("greeting", { ns: "test" })).toBe("Hello");
  expect(loadSystemSettings).toBeTypeOf("function");
});

it("application routes defer lazy page modules until they render", () => {
  let loadCount = 0;
  const lazyRoute = async () => {
    loadCount += 1;
    return { default: () => null };
  };
  const [routeElement] = renderAppRoutes(
    defineAppRoutes([
      {
        name: "reports",
        path: "/reports",
        lazy: lazyRoute,
        access: { roles: ["admin"] },
        resource: { meta: { label: "Reports" } },
      },
    ]),
    {
      AccessGuard: () => "Denied",
      lazyFallback: "Loading reports",
    }
  );

  expect(renderToStaticMarkup(routeElement.props.element)).toBe("Denied");
  expect(loadCount).toBe(0);
  expect(routeElement.props.element.props.children.props.fallback).toBe(
    "Loading reports"
  );
});

it("application routes reject ambiguous eager and lazy content", () => {
  expect(() =>
      renderAppRoutes([
        {
          name: "invalid",
          path: "/invalid",
          element: "eager",
          lazy: async () => ({ default: () => null }),
        },
      ])
  ).toThrow(/cannot declare both element and lazy/);
});
