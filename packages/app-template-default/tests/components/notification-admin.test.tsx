import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";

import {
  NotificationDeliveryAdminPage,
  NotificationProviderAdminPage,
} from "../../registry/notification/admin/pages.tsx";

afterEach(() => vi.unstubAllGlobals());

describe("notification administration pages", () => {
  it("drills into a risky delivery and requires duplicate acknowledgement before retry", async () => {
    const requests: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        requests.push(`${init?.method ?? "GET"} ${url}`);
        if (url.endsWith("/csrf")) return json({ token: "csrf-token" });
        if (url.endsWith("/retry"))
          return json(
            { data: { id: "delivery-1", status: "queued", version: 2 } },
            202
          );
        if (url.includes("/deliveries/delivery-1"))
          return json({ data: detailFixture() });
        return json({
          data: [listFixture()],
          page: 1,
          pageSize: 25,
          total: 1,
          accessBoundary: "TEMPORARY test boundary",
        });
      })
    );
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <NotificationDeliveryAdminPage />
      </MemoryRouter>
    );

    expect(await screen.findByText("Needs attention")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "delivery-1" }));
    expect(
      await screen.findByText("Provider submission is uncertain")
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry delivery" }));
    const confirm = screen.getByRole("button", { name: "Confirm retry" });
    await user.type(
      screen.getByPlaceholderText("Explain why this retry is required…"),
      "Operator reviewed uncertainty"
    );
    expect(confirm).toBeDisabled();
    await user.click(screen.getByRole("checkbox"));
    expect(confirm).toBeEnabled();
    await user.click(confirm);
    await waitFor(() =>
      expect(
        requests.some(
          (request) =>
            request ===
            "POST /api/notifications/admin/deliveries/delivery-1/retry"
        )
      ).toBe(true)
    );
  });

  it("shows read-only provider state and reports a connection test", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith("/csrf")) return json({ token: "csrf-token" });
        if (init?.method === "POST")
          return json({
            data: {
              providerId: "email/smtp/primary",
              ok: true,
              checkedAt: "2026-08-19T00:00:00.000Z",
            },
          });
        return json({
          data: [
            {
              id: "email/smtp/primary",
              order: 1,
              channel: "email",
              type: "smtp",
              enabled: true,
              active: true,
              configRevision: "revision-1",
              connection: {
                host: "smtp.example.test",
                port: 587,
                secure: false,
              },
              secrets: [{ reference: "SMTP_PASSWORD", configured: true }],
            },
          ],
        });
      })
    );
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <NotificationProviderAdminPage />
      </MemoryRouter>
    );

    expect(await screen.findByText("smtp.example.test")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Test connection" }));
    expect(screen.getByText(/does not send an email/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Run test" }));
    expect(await screen.findByText("Connection succeeded")).toBeInTheDocument();
  });
});

function listFixture(): object {
  return {
    id: "delivery-1",
    notificationId: "notification-1",
    channel: "email",
    status: "submission_unknown",
    version: 1,
    recipient: "s***@example.test",
    provider: "email/smtp/primary",
    attemptCount: 1,
    source: { type: "tests.admin", referenceId: "order-1" },
    updatedAt: "2026-08-19T00:00:00.000Z",
  };
}

function detailFixture(): object {
  return {
    ...listFixture(),
    recipient: { kind: "email", email: "s***@example.test" },
    content: {
      schemaVersion: 1,
      fields: ["subject", "text"],
      byteLengths: { subject: 10, text: 20 },
      messageId: "<delivery-1@notification.local>",
    },
    source: {
      type: "tests.admin",
      referenceId: "order-1",
      principalService: "tests",
    },
    providerChain: ["email/smtp/primary"],
    providerCursor: 0,
    attempts: [
      {
        id: "attempt-1",
        sequence: 1,
        providerInstance: "email/smtp/primary",
        providerType: "smtp",
        configRevision: "revision-1",
        status: "submission_unknown",
        startedAt: "2026-08-19T00:00:00.000Z",
        error: { code: "SMTP_SUBMISSION_UNKNOWN", message: "Outcome unknown." },
      },
    ],
    events: [
      {
        sequence: 1,
        toStatus: "submission_unknown",
        occurredAt: "2026-08-19T00:00:00.000Z",
      },
    ],
    createdAt: "2026-08-19T00:00:00.000Z",
  };
}

function json(value: object, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}
