import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Refine } from "@refinedev/core";
import { MemoryRouter, Route, Routes } from "react-router";
import { describe, expect, it, vi } from "vitest";

import { hubGet } from "@/features/hub/api";
import { HubLoginPage } from "@/features/hub/auth-pages";
import { HubAuthGate } from "@/features/hub/gate";
import {
  HubCapabilityRouteGate,
  HubRuntimeProvider,
} from "@/features/hub/provider";
import { createHubAuthRuntime } from "@/features/hub/runtime";

describe("Hub login flow", () => {
  it("returns to the protected deep link after signing in", async () => {
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const path = String(input);
      if (path.endsWith("/setup/status")) {
        return Response.json({
          data: { setupRequired: false, ownerConfigured: true },
          requestId: "setup",
        });
      }
      throw new Error(`Unexpected request: ${path}`);
    });
    const login = vi.fn(async () => ({
      success: false,
      error: new Error("Stop after capturing the destination"),
    }));

    render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: "/login",
            state: {
              from: {
                pathname: "/deployments/deployment-1",
                search: "?tab=events",
                hash: "#event-2",
              },
            },
          },
        ]}
      >
        <Refine
          authProvider={{
            login,
            logout: async () => ({ success: true }),
            check: async () => ({ authenticated: false }),
            onError: async () => ({}),
          }}
        >
          <Routes>
            <Route path="/login" element={<HubLoginPage fetcher={fetcher} />} />
          </Routes>
        </Refine>
      </MemoryRouter>,
    );

    fireEvent.change(await screen.findByLabelText("Username or email"), {
      target: { value: "owner@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "correct horse battery staple" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() =>
      expect(login).toHaveBeenCalledWith({
        identifier: "owner@example.com",
        password: "correct horse battery staple",
        redirectTo: "/deployments/deployment-1?tab=events#event-2",
      }),
    );
  });

  it("allows an application-scoped viewer through the matching detail gate", async () => {
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const path = String(input);
      if (path.endsWith("/me")) {
        return Response.json({
          data: {
            user: {
              id: "viewer",
              name: "Scoped viewer",
              email: "viewer@example.com",
            },
            roles: [],
            capabilities: {
              global: [],
              application: [
                {
                  applicationId: "app-1",
                  capabilities: [{ resource: "hub.app", actions: ["read"] }],
                },
              ],
            },
          },
          requestId: "scoped-me",
        });
      }
      throw new Error(`Unexpected request: ${path}`);
    });

    render(
      <MemoryRouter initialEntries={["/apps/app-1"]}>
        <Routes>
          <Route
            path="/apps/:appId"
            element={
              <HubRuntimeProvider fetcher={fetcher}>
                <HubCapabilityRouteGate
                  resource="hub.app"
                  action="read"
                  applicationParam="appId"
                >
                  <div>Scoped application</div>
                </HubCapabilityRouteGate>
              </HubRuntimeProvider>
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText("Scoped application")).toBeInTheDocument();
  });

  it("returns to login and revalidates after a protected request expires", async () => {
    let sessionRequests = 0;
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const path = String(input);
      if (path.endsWith("/auth/get-session")) {
        sessionRequests += 1;
        return Response.json(
          sessionRequests === 1
            ? {
                user: {
                  id: "owner",
                  name: "Owner",
                  email: "owner@example.com",
                },
                session: {
                  id: "session",
                  expiresAt: "2026-09-01T00:00:00.000Z",
                },
              }
            : null,
        );
      }
      if (path.endsWith("/setup/status")) {
        return Response.json({
          data: { setupRequired: false, ownerConfigured: true },
          requestId: "setup",
        });
      }
      if (path.endsWith("/protected")) {
        return Response.json(
          {
            error: { code: "UNAUTHORIZED", message: "Session expired" },
            requestId: "expired",
          },
          { status: 401 },
        );
      }
      throw new Error(`Unexpected request: ${path}`);
    });
    const runtime = createHubAuthRuntime({ baseURL: "/hub/api", fetcher });

    render(
      <MemoryRouter initialEntries={["/apps"]}>
        <Refine authProvider={runtime.authProvider}>
          <HubAuthGate runtime={runtime} fetcher={fetcher}>
            <Routes>
              <Route
                path="/apps"
                element={
                  <button
                    type="button"
                    onClick={() => {
                      void hubGet("/protected", fetcher).catch(() => undefined);
                    }}
                  >
                    Load protected data
                  </button>
                }
              />
              <Route path="/login" element={<div>Sign in again</div>} />
            </Routes>
          </HubAuthGate>
        </Refine>
      </MemoryRouter>,
    );

    fireEvent.click(
      await screen.findByRole("button", { name: "Load protected data" }),
    );

    expect(await screen.findByText("Sign in again")).toBeInTheDocument();
    expect(sessionRequests).toBe(2);
  });
});
