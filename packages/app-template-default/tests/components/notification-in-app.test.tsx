import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";

import { NotificationInAppPage } from "../../registry/nocobase-notification/in-app/page.tsx";
import { NotificationInAppProvider } from "../../registry/nocobase-notification/in-app/runtime.tsx";

afterEach(() => vi.unstubAllGlobals());

describe("notification Inbox page", () => {
  it("renders HTTP state and optimistically reads an item before reconciling", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith("/unread-count")) return json({ count: 1 });
        if (url.endsWith("/csrf")) return json({ token: "csrf-token" });
        if (init?.method === "POST") {
          return json({
            data: {
              ...itemFixture(),
              readAt: "2026-08-20T00:01:00.000Z",
              version: 2,
            },
          });
        }
        return json({ data: [itemFixture()] });
      }),
    );
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <NotificationInAppProvider>
          <NotificationInAppPage />
        </NotificationInAppProvider>
      </MemoryRouter>,
    );

    expect(
      await screen.findByText("Approval request assigned"),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Mark read" }));
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        "/api/notifications/in-app/item-1",
        expect.objectContaining({ method: "POST" }),
      ),
    );
  });

  it("renders multiple in-app items from the notification Channel", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/unread-count")) return json({ count: 2 });
        return json({
          data: [itemFixture(), { ...itemFixture(), id: "item-2" }],
        });
      }),
    );

    render(
      <MemoryRouter>
        <NotificationInAppProvider>
          <NotificationInAppPage />
        </NotificationInAppProvider>
      </MemoryRouter>,
    );

    expect(
      await screen.findAllByText("Approval request assigned"),
    ).toHaveLength(2);
    expect(screen.getAllByText("In-app")).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Mark read" })).toHaveLength(
      2,
    );
  });
});

function itemFixture(): object {
  return {
    id: "item-1",
    deliveryId: "delivery-1",
    notificationId: "notification-1",
    channel: "in-app",
    title: "Approval request assigned",
    body: "A purchase request is waiting for review.",
    actionUrl: "/requests/1",
    createdAt: "2026-08-20T00:00:00.000Z",
    version: 1,
  };
}

function json(value: object, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}
