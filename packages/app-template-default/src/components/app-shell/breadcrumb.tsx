"use client";

import { Fragment, useMemo } from "react";
import { Home } from "lucide-react";
import {
  type IResourceItem,
  matchResourceFromRoute,
  useBreadcrumb,
  useGetToPath,
  useLink,
  useParsed,
  useResourceParams,
  useTranslate,
  useUserFriendlyName,
} from "@refinedev/core";
import {
  BreadcrumbSeparator as ShadcnBreadcrumbSeparator,
  BreadcrumbItem as ShadcnBreadcrumbItem,
  BreadcrumbList as ShadcnBreadcrumbList,
  BreadcrumbPage as ShadcnBreadcrumbPage,
  Breadcrumb as ShadcnBreadcrumb,
} from "@/components/ui/breadcrumb";
import { resolveTranslatableText } from "@nocobase/portal-sdk/i18n";
import { getResourceLabel } from "@/components/resources/resource-label";

export function Breadcrumb() {
  const Link = useLink();
  const { breadcrumbs } = useBreadcrumb();
  const { resources } = useResourceParams();
  const { pathname } = useParsed();
  const getToPath = useGetToPath();
  const translate = useTranslate();
  const getUserFriendlyName = useUserFriendlyName();
  const rootRouteResource = matchResourceFromRoute("/", resources);
  const resolvedBreadcrumbs = useMemo(() => {
    if (breadcrumbs.length > 0) return breadcrumbs;

    const closestMatch = findClosestRouteMatch(pathname, resources);
    if (!closestMatch.resource) return breadcrumbs;

    const items: Array<{ label: string; href?: string }> = [
      {
        label:
          closestMatch.resource.meta?.label ?? closestMatch.resource.name,
        href: getToPath({ resource: closestMatch.resource, action: "list" }),
      },
    ];
    const nestedAction = getNestedRouteAction(
      pathname,
      closestMatch.matchedSegmentCount
    ) ??
      (closestMatch.action && closestMatch.action !== "list"
        ? closestMatch.action
        : undefined);
    if (nestedAction) {
      items.push({
        label: translate(
          `buttons.${nestedAction}`,
          nestedAction.charAt(0).toUpperCase() + nestedAction.slice(1)
        ),
      });
    }

    return items;
  }, [breadcrumbs, getToPath, pathname, resources, translate]);

  const breadCrumbItems = useMemo(() => {
    const list: {
      key: string;
      href: string;
      Component: React.ReactNode;
    }[] = [];

    list.push({
      key: "breadcrumb-item-home",
      href: rootRouteResource.matchedRoute ?? "/",
      Component: (
        <Link to={rootRouteResource.matchedRoute ?? "/"}>
          {rootRouteResource?.resource?.meta?.icon ?? (
            <Home className="h-4 w-4" />
          )}
        </Link>
      ),
    });

    for (const { label, href } of resolvedBreadcrumbs) {
      const matchingResource = resources.find((resource) => {
        const metaLabel = resource.meta?.label;
        return (
          label === metaLabel ||
          label === resource.name ||
          (href &&
            [resource.list, resource.create, resource.edit, resource.show].some(
              (route) => typeof route === "string" && route === href
            ))
        );
      });
      const displayLabel = matchingResource
        ? getResourceLabel(
            matchingResource,
            "plural",
            translate,
            getUserFriendlyName
          )
        : resolveTranslatableText(label);
      list.push({
        key: `breadcrumb-item-${displayLabel}`,
        href: href ?? "",
        Component: href ? (
          <Link to={href}>{displayLabel}</Link>
        ) : (
          <span>{displayLabel}</span>
        ),
      });
    }

    return list;
  }, [
    getUserFriendlyName,
    Link,
    resolvedBreadcrumbs,
    resources,
    rootRouteResource,
    translate,
  ]);

  return (
    <ShadcnBreadcrumb>
      <ShadcnBreadcrumbList>
        {breadCrumbItems.map((item, index) => {
          if (index === breadCrumbItems.length - 1) {
            return (
              <ShadcnBreadcrumbPage key={item.key}>
                {item.Component}
              </ShadcnBreadcrumbPage>
            );
          }

          return (
            <Fragment key={item.key}>
              <ShadcnBreadcrumbItem key={item.key}>
                {item.Component}
              </ShadcnBreadcrumbItem>
              <ShadcnBreadcrumbSeparator />
            </Fragment>
          );
        })}
      </ShadcnBreadcrumbList>
    </ShadcnBreadcrumb>
  );
}

function findClosestRouteMatch(
  pathname: string | undefined,
  resources: IResourceItem[]
) {
  const segments = pathname?.split("/").filter(Boolean) ?? [];

  for (let length = segments.length; length >= 0; length -= 1) {
    const route = `/${segments.slice(0, length).join("/")}`;
    const match = matchResourceFromRoute(route, resources);
    if (match.resource) {
      return { ...match, matchedSegmentCount: length };
    }
  }

  return { resource: undefined, matchedSegmentCount: 0 };
}

function getNestedRouteAction(
  pathname: string | undefined,
  matchedSegmentCount: number
) {
  const segments = pathname?.split("/").filter(Boolean) ?? [];
  const action = segments[matchedSegmentCount];

  return action && ["create", "edit", "show", "clone"].includes(action)
    ? action
    : undefined;
}

Breadcrumb.displayName = "Breadcrumb";
