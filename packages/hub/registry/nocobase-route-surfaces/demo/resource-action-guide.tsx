import { PromptOutput } from "@/components/demo/prompt-output";

const overlayExample = `export const appRoutes = defineAppRoutes([
  {
    name: "customers",
    path: "customers",
    lazy: () => import("./customers/list"),
    resource: { meta: { label: "Customers" } },
    children: [
      {
        name: "customers.create",
        path: "create",
        resourceAction: "create",
        lazy: () => import("./customers/create-route"),
      },
    ],
  },
]);

// ./customers/create-route.tsx
export default function CustomerCreateRoute() {
  return (
    <RouteDrawer
      title="Create customer"
      closeLabel="Close"
      closeTo="/customers"
    >
      <CustomerCreateForm />
    </RouteDrawer>
  );
}`;

const pageExample = `function CustomerResourceLayout() {
  const childPage = useOutlet();
  return childPage ?? <CustomerList />;
}

export const appRoutes = defineAppRoutes([
  {
    name: "customers",
    path: "customers",
    outlet: "manual",
    element: <CustomerResourceLayout />,
    resource: { meta: { label: "Customers" } },
    children: [
      {
        name: "customers.create",
        path: "create",
        resourceAction: "create",
        lazy: () => import("./customers/create-page"),
      },
    ],
  },
]);`;

const contextualExample = `export const appRoutes = defineAppRoutes([
  {
    name: "customers",
    path: "customers",
    lazy: () => import("./customers/list"),
    resource: { meta: { label: "Customers" } },
    children: [
      // These are contextual child routes. They stay under the host page.
      {
        name: "customers.create",
        path: "create",
        resourceAction: "create",
        lazy: () => import("./customers/create-route"),
      },
      {
        name: "customers.edit",
        path: "edit/:id",
        resourceAction: "edit",
        lazy: () => import("./customers/edit-route"),
      },
      {
        name: "customers.show",
        path: "show/:id",
        resourceAction: "show",
        lazy: () => import("./customers/show-route"),
        children: [
          {
            name: "customers.show.edit",
            path: "edit",
            // Contextual duplicate: do not register a second resourceAction.
            lazy: () => import("./customers/show-edit-route"),
          },
        ],
      },
    ],
  },
]);

// CustomerShowRoute renders useOutlet() through RouteDrawer's nested prop.
// From the list, use navigate("edit/42") or navigate("show/42").
// From CustomerShowRoute, use navigate("edit") for the contextual editor.
// Do not navigate to a fixed /customers/edit/42 URL from another host.`;

export function ResourceActionGuide() {
  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h2 className="font-heading text-xl font-semibold">
          Refine resource actions
        </h2>
        <p className="max-w-3xl text-sm text-muted-foreground">
          <code>resourceAction</code> registers the action URL. The resolved route
          component still decides whether that URL opens an overlay or replaces
          the list. Load page modules through the route&apos;s <code>lazy</code> field,
          and add ACL and unsaved-change handling as shown in the installed
          Users example.
        </p>
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <PromptOutput
          title="List + routed drawer"
          description="Use the automatic resource outlet and let the child own RouteDrawer."
          prompt={overlayExample}
          copyLabel="Copy example"
          copiedLabel="Copied"
          promptClassName="min-h-96"
        />
        <PromptOutput
          title="Full page replaces the list"
          description="Use a manual resource outlet when the action is a standalone page."
          prompt={pageExample}
          copyLabel="Copy example"
          copiedLabel="Copied"
          promptClassName="min-h-96"
        />
        <PromptOutput
          title="Contextual child surfaces"
          description="Reuse create, edit, and detail content while each host owns its nested route."
          prompt={contextualExample}
          copyLabel="Copy example"
          copiedLabel="Copied"
          promptClassName="min-h-96"
        />
      </div>
    </section>
  );
}
