import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { NotificationEmailLogsPage } from "../../registry/nocobase-notification/logs/page.tsx";

afterEach(() => vi.unstubAllGlobals());

describe("notification email logs", () => {
  it("renders email Delivery state and Provider Attempts", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        json({
          data: [
            {
              log: {
                id: "notification-1",
                sourceType: "workflow",
                status: "completed",
                createdAt: "2026-08-21T00:00:00.000Z",
                updatedAt: "2026-08-21T00:00:01.000Z",
              },
              deliveries: [
                {
                  delivery: {
                    id: "delivery-1",
                    notificationId: "notification-1",
                    channel: "email",
                    recipientKey: "user@example.com",
                    providerChain: ["primary", "secondary"],
                    attemptCount: 2,
                    status: "sent",
                    createdAt: "2026-08-21T00:00:00.000Z",
                    updatedAt: "2026-08-21T00:00:01.000Z",
                  },
                  attempts: [
                    {
                      id: "attempt-1",
                      sequence: 1,
                      providerName: "primary",
                      providerType: "smtp",
                      status: "failed",
                      startedAt: "2026-08-21T00:00:00.000Z",
                      error: { message: "SMTP unavailable" },
                    },
                    {
                      id: "attempt-2",
                      sequence: 2,
                      providerName: "secondary",
                      providerType: "smtp",
                      status: "sent",
                      startedAt: "2026-08-21T00:00:01.000Z",
                    },
                  ],
                },
              ],
            },
          ],
        }),
      ),
    );

    render(<NotificationEmailLogsPage />);

    expect(await screen.findByText("user@example.com")).toBeInTheDocument();
    expect(screen.getAllByText("primary").length).toBeGreaterThan(0);
    expect(screen.getAllByText("secondary").length).toBeGreaterThan(0);
    expect(screen.getByText("SMTP unavailable")).toBeInTheDocument();
  });
});

function json(value: object): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
