import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router";
import { Refine } from "@refinedev/core";

import type {
  HubApplication,
  HubCapabilities,
  HubDeployment,
  HubDeploymentEvent,
  HubRelease,
} from "@/features/hub/api";
import { ApplicationsPage } from "@/pages/applications/list";
import { ApplicationDetailPage } from "@/pages/applications/detail";
import { DeploymentDetailPage } from "@/pages/deployments/detail";
import { DeploymentsPage } from "@/pages/deployments/list";
import { HubLoginPage, HubSetupPage } from "@/features/hub/auth-pages";
import { HubAuthGate } from "@/features/hub/gate";
import { HubRuntimeProvider } from "@/features/hub/provider";
import { createHubAuthRuntime } from "@/features/hub/runtime";

const application: HubApplication = {
  id: "app-1",
  slug: "inventory",
  name: "Inventory",
  description: "Stock control",
  status: "active",
  defaultEnvironmentId: "default",
  activeReleaseId: "release-2",
  createdBy: "owner",
  createdAt: "2026-08-20T10:00:00.000Z",
  updatedAt: "2026-08-21T10:00:00.000Z",
};

const release: HubRelease = {
  id: "release-2",
  applicationId: "app-1",
  version: "1.2.0",
  checksum: "sha256:abc",
  manifest: { entry: "index.html" },
  sizeBytes: 1024,
  sourceCommit: "abc123",
  verificationStatus: "verified",
  createdBy: "owner",
  createdAt: "2026-08-21T09:00:00.000Z",
};

const deployment: HubDeployment = {
  id: "deployment-1",
  applicationId: "app-1",
  environmentId: "default",
  targetReleaseId: "release-2",
  previousReleaseId: "release-1",
  type: "deploy",
  status: "succeeded",
  requestedBy: "owner",
  hostOperationId: "host-op-1",
  startedAt: "2026-08-21T09:01:00.000Z",
  finishedAt: "2026-08-21T09:02:00.000Z",
  failure: null,
  createdAt: "2026-08-21T09:00:30.000Z",
};

const event: HubDeploymentEvent = {
  id: "event-1",
  deploymentId: "deployment-1",
  sequence: 1,
  type: "readiness",
  status: "succeeded",
  message: "Readiness checks passed",
  hostId: "host-1",
  runtimeId: "runtime-1",
  details: {},
  createdAt: "2026-08-21T09:01:30.000Z",
};

const readOnly: HubCapabilities = {
  global: [
    { resource: "hub.app", actions: ["read"] },
    { resource: "hub.release", actions: ["read"] },
    { resource: "hub.deployment", actions: ["read"] },
  ],
  application: [],
};

function response<T>(data: T, meta = { total: 1, limit: 20, offset: 0 }) {
  return new Response(
    JSON.stringify({ data, meta, requestId: "test-request" }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

describe("Hub application pages", () => {
  it("creates an application through the Hub API and refreshes the list", async () => {
    const capabilities: HubCapabilities = {
      global: [{ resource: "hub.app", actions: ["create", "read"] }],
      application: [],
    };
    let applications: HubApplication[] = [];
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const path = String(input);
      if (path.endsWith("/me")) {
        return response({ user: null, roles: ["Owner"], capabilities });
      }
      if (path.endsWith("/apps") && init?.method === "POST") {
        const body = JSON.parse(String(init.body)) as {
          slug: string;
          name: string;
          description?: string;
        };
        applications = [
          {
            ...application,
            id: "app-created",
            slug: body.slug,
            name: body.name,
            description: body.description ?? null,
            activeReleaseId: null,
          },
        ];
        return new Response(
          JSON.stringify({ data: applications[0], requestId: "created" }),
          { status: 201, headers: { "content-type": "application/json" } },
        );
      }
      if (path.endsWith("/apps")) {
        return response(applications, {
          total: applications.length,
          limit: 20,
          offset: 0,
        });
      }
      throw new Error(`Unexpected request: ${path}`);
    });

    render(
      <MemoryRouter>
        <ApplicationsPage fetcher={fetchMock} />
      </MemoryRouter>,
    );

    fireEvent.click(
      await screen.findByRole("button", { name: /create application/i }),
    );
    const slugInput = screen.getByLabelText("Slug");
    const slugPattern = slugInput.getAttribute("pattern");
    expect(slugPattern).toContain("\\-");
    expect(() => new RegExp(slugPattern ?? "", "v")).not.toThrow();
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Orders" },
    });
    fireEvent.change(screen.getByLabelText("Slug"), {
      target: { value: "orders" },
    });
    fireEvent.change(screen.getByLabelText("Description"), {
      target: { value: "Order operations" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^create$/i }));

    expect(await screen.findAllByText("Orders")).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledWith(
      "/hub/api/apps",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          name: "Orders",
          slug: "orders",
          description: "Order operations",
        }),
      }),
    );
  });

  it("loads the next page when the application result has more records", async () => {
    const firstPage = Array.from({ length: 20 }, (_, index) => ({
      ...application,
      id: `app-${index + 1}`,
      name: `Application ${index + 1}`,
    }));
    const secondPage = [
      { ...application, id: "app-21", name: "Application 21" },
    ];
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const path = String(input);
      if (path.endsWith("/me")) {
        return response({ user: null, roles: [], capabilities: readOnly });
      }
      if (path.endsWith("/apps?limit=20&offset=20")) {
        return response(secondPage, { total: 21, limit: 20, offset: 20 });
      }
      if (path.endsWith("/apps")) {
        return response(firstPage, { total: 21, limit: 20, offset: 0 });
      }
      throw new Error(`Unexpected request: ${path}`);
    });

    render(
      <MemoryRouter>
        <ApplicationsPage fetcher={fetchMock} />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("button", { name: /load more/i }));
    expect(await screen.findAllByText("Application 21")).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledWith(
      "/hub/api/apps?limit=20&offset=20",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("renders a useful empty state and hides create actions without capability", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const path = String(input);
      if (path.endsWith("/apps"))
        return response<HubApplication[]>([], {
          total: 0,
          limit: 20,
          offset: 0,
        });
      if (path.endsWith("/me"))
        return response({ user: null, roles: [], capabilities: readOnly });
      throw new Error(`Unexpected request: ${path}`);
    });

    render(
      <MemoryRouter>
        <ApplicationsPage fetcher={fetchMock} onCreateApplication={vi.fn()} />
      </MemoryRouter>,
    );

    expect(await screen.findByText("No applications yet")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /create application/i }),
    ).not.toBeInTheDocument();
  });

  it("shows a release and deployment tabs while hiding deploy for a viewer", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const path = String(input);
      if (path.endsWith("/apps/app-1")) return response(application);
      if (path.endsWith("/apps/app-1/releases")) return response([release]);
      if (path.endsWith("/apps/app-1/deployments"))
        return response([deployment]);
      if (path.endsWith("/me"))
        return response({
          user: null,
          roles: ["Viewer"],
          capabilities: readOnly,
        });
      throw new Error(`Unexpected request: ${path}`);
    });

    render(
      <MemoryRouter>
        <ApplicationDetailPage
          applicationId="app-1"
          fetcher={fetchMock}
          onDeployRelease={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("heading", { name: "Inventory" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Releases" }));
    expect(await screen.findByText("1.2.0")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /deploy/i }),
    ).not.toBeInTheDocument();
  });

  it("does not request or misreport resources outside an app-only scope", async () => {
    const appOnly: HubCapabilities = {
      global: [],
      application: [
        {
          applicationId: "app-1",
          capabilities: [{ resource: "hub.app", actions: ["read"] }],
        },
      ],
    };
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const path = String(input);
      if (path.endsWith("/me")) {
        return response({ user: null, roles: [], capabilities: appOnly });
      }
      if (path.endsWith("/apps/app-1")) return response(application);
      throw new Error(`Unexpected request: ${path}`);
    });

    render(
      <MemoryRouter>
        <HubRuntimeProvider fetcher={fetchMock}>
          <ApplicationDetailPage applicationId="app-1" fetcher={fetchMock} />
        </HubRuntimeProvider>
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("heading", { name: "Inventory" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Releases" })).toBeNull();
    expect(screen.queryByRole("tab", { name: "Deployments" })).toBeNull();
    expect(screen.getAllByText("Restricted")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Home" })).toHaveAttribute(
      "href",
      "/",
    );
    expect(
      fetchMock.mock.calls.some(([input]) =>
        String(input).endsWith("/apps/app-1/releases"),
      ),
    ).toBe(false);
    expect(
      fetchMock.mock.calls.some(([input]) =>
        String(input).endsWith("/apps/app-1/deployments"),
      ),
    ).toBe(false);
  });

  it("loads additional releases from application pagination metadata", async () => {
    const firstPage = Array.from({ length: 20 }, (_, index) => ({
      ...release,
      id: `release-${index + 1}`,
      version: `1.${index + 1}.0`,
    }));
    const nextRelease = {
      ...release,
      id: "release-21",
      version: "1.21.0",
    };
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const path = String(input);
      if (path.endsWith("/apps/app-1")) return response(application);
      if (path.endsWith("/apps/app-1/releases?limit=20&offset=20")) {
        return response([nextRelease], { total: 21, limit: 20, offset: 20 });
      }
      if (path.endsWith("/apps/app-1/releases")) {
        return response(firstPage, { total: 21, limit: 20, offset: 0 });
      }
      if (path.endsWith("/apps/app-1/deployments")) return response([]);
      if (path.endsWith("/me")) {
        return response({ user: null, roles: [], capabilities: readOnly });
      }
      throw new Error(`Unexpected request: ${path}`);
    });

    render(
      <MemoryRouter>
        <ApplicationDetailPage applicationId="app-1" fetcher={fetchMock} />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("tab", { name: "Releases" }));
    fireEvent.click(await screen.findByRole("button", { name: "Load more" }));

    expect(await screen.findByText("1.21.0")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/hub/api/apps/app-1/releases?limit=20&offset=20",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("loads additional application deployments from pagination metadata", async () => {
    const firstPage = Array.from({ length: 20 }, (_, index) => ({
      ...deployment,
      id: `deployment-${index + 1}`,
    }));
    const nextDeployment = { ...deployment, id: "deployment-21" };
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const path = String(input);
      if (path.endsWith("/apps/app-1")) return response(application);
      if (path.endsWith("/apps/app-1/releases")) return response([release]);
      if (path.endsWith("/apps/app-1/deployments?limit=20&offset=20")) {
        return response([nextDeployment], {
          total: 21,
          limit: 20,
          offset: 20,
        });
      }
      if (path.endsWith("/apps/app-1/deployments")) {
        return response(firstPage, { total: 21, limit: 20, offset: 0 });
      }
      if (path.endsWith("/me")) {
        return response({ user: null, roles: [], capabilities: readOnly });
      }
      throw new Error(`Unexpected request: ${path}`);
    });

    render(
      <MemoryRouter>
        <ApplicationDetailPage applicationId="app-1" fetcher={fetchMock} />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("tab", { name: "Deployments" }));
    fireEvent.click(await screen.findByRole("button", { name: "Load more" }));

    expect(await screen.findByText("deployment-21")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/hub/api/apps/app-1/deployments?limit=20&offset=20",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("creates a deployment for a verified release and navigates to it", async () => {
    const candidate = {
      ...release,
      id: "release-3",
      version: "1.3.0",
    };
    const writable: HubCapabilities = {
      global: [
        { resource: "hub.app", actions: ["read"] },
        { resource: "hub.release", actions: ["read"] },
        { resource: "hub.deployment", actions: ["create", "read"] },
      ],
      application: [],
    };
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const path = String(input);
      if (path.endsWith("/apps/app-1")) return response(application);
      if (path.endsWith("/apps/app-1/releases"))
        return response([release, candidate]);
      if (path.endsWith("/apps/app-1/deployments") && init?.method === "POST") {
        return new Response(
          JSON.stringify({
            data: {
              ...deployment,
              id: "deployment-created",
              targetReleaseId: candidate.id,
              type: "deploy",
              status: "queued",
            },
            requestId: "deployment-request",
          }),
          { status: 202, headers: { "content-type": "application/json" } },
        );
      }
      if (path.endsWith("/apps/app-1/deployments")) return response([]);
      if (path.endsWith("/me"))
        return response({
          user: null,
          roles: ["Deployer"],
          capabilities: writable,
        });
      throw new Error(`Unexpected request: ${path}`);
    });

    render(
      <MemoryRouter initialEntries={["/apps/app-1"]}>
        <ApplicationDetailPage applicationId="app-1" fetcher={fetchMock} />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("tab", { name: "Releases" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Deploy 1.3.0" }),
    );
    expect(
      await screen.findByText(/current release.*1\.2\.0/i),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: /confirm deployment/i }),
    );

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/hub/api/apps/app-1/deployments",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            targetReleaseId: "release-3",
            type: "deploy",
          }),
        }),
      ),
    );
  });
});

describe("Hub setup page", () => {
  it("moves to sign in when owner creation succeeds but automatic login fails", async () => {
    let ownerCreated = false;
    let setupChecksAfterOwnerCreation = 0;
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const path = String(input);
      if (path.endsWith("/setup/status")) {
        if (ownerCreated) setupChecksAfterOwnerCreation += 1;
        return response({
          setupRequired: !ownerCreated,
          ownerConfigured: ownerCreated,
        });
      }
      if (path.endsWith("/setup/owner") && init?.method === "POST") {
        ownerCreated = true;
        return new Response(
          JSON.stringify({
            data: { user: { id: "owner" } },
            requestId: "owner",
          }),
          { status: 201, headers: { "content-type": "application/json" } },
        );
      }
      if (path.endsWith("/auth/get-session")) {
        return Response.json(null);
      }
      if (path.endsWith("/auth/sign-in/email")) {
        return Response.json(
          { error: { code: "SIGN_IN_FAILED", message: "Sign in failed" } },
          { status: 401 },
        );
      }
      throw new Error(`Unexpected request: ${path}`);
    });
    const runtime = createHubAuthRuntime({
      baseURL: "/hub/api",
      fetcher: fetchMock,
    });

    render(
      <MemoryRouter initialEntries={["/setup"]}>
        <Refine authProvider={runtime.authProvider}>
          <HubAuthGate runtime={runtime} fetcher={fetchMock}>
            <Routes>
              <Route
                path="/setup"
                element={<HubSetupPage fetcher={fetchMock} />}
              />
              <Route
                path="/login"
                element={<HubLoginPage fetcher={fetchMock} />}
              />
            </Routes>
          </HubAuthGate>
        </Refine>
      </MemoryRouter>,
    );

    fireEvent.change(await screen.findByLabelText("Name"), {
      target: { value: "Owner" },
    });
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "owner@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "correct horse battery staple" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create Owner" }));

    expect(
      await screen.findByText("Owner created. Sign in to continue."),
    ).toBeInTheDocument();
    expect(setupChecksAfterOwnerCreation).toBeGreaterThan(0);
  });
});

describe("Hub deployment list", () => {
  it("loads additional deployments from pagination metadata", async () => {
    const firstPage = Array.from({ length: 20 }, (_, index) => ({
      ...deployment,
      id: `deployment-${index + 1}`,
    }));
    const nextDeployment = { ...deployment, id: "deployment-21" };
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const path = String(input);
      if (path.endsWith("/deployments?limit=20&offset=20")) {
        return response([nextDeployment], {
          total: 21,
          limit: 20,
          offset: 20,
        });
      }
      if (path.endsWith("/deployments")) {
        return response(firstPage, { total: 21, limit: 20, offset: 0 });
      }
      if (path.endsWith("/apps")) return response([application]);
      throw new Error(`Unexpected request: ${path}`);
    });

    render(
      <MemoryRouter>
        <DeploymentsPage fetcher={fetchMock} />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Load more" }));

    expect(await screen.findAllByText("deployment-21")).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledWith(
      "/hub/api/deployments?limit=20&offset=20",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("loads every application page before resolving deployment names", async () => {
    const firstPage = Array.from({ length: 20 }, (_, index) => ({
      ...application,
      id: `app-${index + 1}`,
      name: `Application ${index + 1}`,
    }));
    const lastApplication = {
      ...application,
      id: "app-21",
      name: "Application 21",
    };
    const deploymentForLastApplication = {
      ...deployment,
      id: "deployment-21",
      applicationId: "app-21",
    };
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const path = String(input);
      if (path.endsWith("/deployments")) {
        return response([deploymentForLastApplication]);
      }
      if (path.endsWith("/apps?limit=20&offset=20")) {
        return response([lastApplication], {
          total: 21,
          limit: 20,
          offset: 20,
        });
      }
      if (path.endsWith("/apps")) {
        return response(firstPage, { total: 21, limit: 20, offset: 0 });
      }
      throw new Error(`Unexpected request: ${path}`);
    });

    render(
      <MemoryRouter>
        <DeploymentsPage fetcher={fetchMock} />
      </MemoryRouter>,
    );

    expect(await screen.findAllByText("Application 21")).toHaveLength(3);
    expect(fetchMock).toHaveBeenCalledWith(
      "/hub/api/apps?limit=20&offset=20",
      expect.objectContaining({ method: "GET" }),
    );
  });
});

describe("Deployment detail page", () => {
  it("redeploys the same target release through the Hub API", async () => {
    const writable: HubCapabilities = {
      global: [{ resource: "hub.deployment", actions: ["create", "read"] }],
      application: [],
    };
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const path = String(input);
      if (path.endsWith("/deployments/deployment-1"))
        return response(deployment);
      if (path.endsWith("/deployments/deployment-1/events"))
        return response([event]);
      if (path.endsWith("/apps/app-1/deployments") && init?.method === "POST") {
        return new Response(
          JSON.stringify({
            data: {
              ...deployment,
              id: "deployment-recreated",
              type: "redeploy",
              status: "queued",
            },
            requestId: "redeploy-request",
          }),
          { status: 202, headers: { "content-type": "application/json" } },
        );
      }
      if (path.endsWith("/me"))
        return response({
          user: null,
          roles: ["Deployer"],
          capabilities: writable,
        });
      throw new Error(`Unexpected request: ${path}`);
    });

    render(
      <MemoryRouter>
        <DeploymentDetailPage deploymentId="deployment-1" fetcher={fetchMock} />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Redeploy" }));
    fireEvent.click(screen.getByRole("button", { name: /confirm redeploy/i }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/hub/api/apps/app-1/deployments",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            targetReleaseId: "release-2",
            type: "redeploy",
          }),
        }),
      ),
    );
  });

  it("returns a deployment-only scoped viewer to the accessible home", async () => {
    const deploymentOnly: HubCapabilities = {
      global: [],
      application: [
        {
          applicationId: "app-1",
          capabilities: [{ resource: "hub.deployment", actions: ["read"] }],
        },
      ],
    };
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const path = String(input);
      if (path.endsWith("/me")) {
        return response({
          user: null,
          roles: [],
          capabilities: deploymentOnly,
        });
      }
      if (path.endsWith("/deployments/deployment-1")) {
        return response(deployment);
      }
      if (path.endsWith("/deployments/deployment-1/events")) {
        return response([event]);
      }
      throw new Error(`Unexpected request: ${path}`);
    });

    render(
      <MemoryRouter>
        <HubRuntimeProvider fetcher={fetchMock}>
          <DeploymentDetailPage
            deploymentId="deployment-1"
            fetcher={fetchMock}
          />
        </HubRuntimeProvider>
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("heading", { name: /deployment-1/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Home" })).toHaveAttribute(
      "href",
      "/",
    );
  });

  it("renders an event timeline and failure details", async () => {
    const failed = {
      ...deployment,
      status: "failed" as const,
      failure: { code: "READINESS_FAILED", message: "Health check failed" },
    };
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const path = String(input);
      if (path.endsWith("/deployments/deployment-1")) return response(failed);
      if (path.endsWith("/deployments/deployment-1/events"))
        return response([event]);
      if (path.endsWith("/me"))
        return response({
          user: null,
          roles: ["Viewer"],
          capabilities: readOnly,
        });
      throw new Error(`Unexpected request: ${path}`);
    });

    render(
      <MemoryRouter>
        <DeploymentDetailPage deploymentId="deployment-1" fetcher={fetchMock} />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("heading", { name: /deployment-1/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("list", { name: /deployment events/i }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText("Readiness checks passed"),
    ).toBeInTheDocument();
    expect(screen.getByText("Health check failed")).toBeInTheDocument();
  });

  it("offers a retry action after a failed request", async () => {
    const fetchMock = vi.fn<typeof fetch>(
      async () =>
        new Response(
          JSON.stringify({
            error: { code: "UNAVAILABLE", message: "Service unavailable" },
            requestId: "req",
          }),
          {
            status: 503,
            headers: { "content-type": "application/json" },
          },
        ),
    );

    render(
      <MemoryRouter>
        <DeploymentDetailPage deploymentId="deployment-1" fetcher={fetchMock} />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Service unavailable")).toBeInTheDocument();
    const requestsBeforeRetry = fetchMock.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledTimes(requestsBeforeRetry + 1),
    );
  });
});
