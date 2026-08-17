import { describe, expect, it } from "vitest";

import {
  AIFrontendToolRegistry,
  createFrontendToolInvokers,
} from "../providers/frontend-tool-registry";

const invocationContext = {
  sessionId: "session-1",
  messageId: "message-1",
  toolCallId: "tool-call-1",
  toolName: "executeFrontendTool",
  allowedFrontendToolIds: [] as string[],
};

describe("AI frontend tools", () => {
  it("publishes and invokes only tools allowed by page context", async () => {
    const registry = new AIFrontendToolRegistry();
    const calls: unknown[] = [];
    const unregister = registry.register("quote-card", {
      name: "update_quote_discount",
      description: "Update the quote discount preview.",
      permission: "ASK",
      inputSchema: {
        type: "object",
        properties: { discountPercent: { type: "number" } },
      },
      execute: (args) => {
        calls.push(args);
        return { updated: true };
      },
    });
    const [manifest] = registry.list("quote-card");
    const invokers = createFrontendToolInvokers(registry);
    const context = {
      ...invocationContext,
      allowedFrontendToolIds: [manifest.id],
    };

    await expect(
      invokers.loadFrontendTool({ toolId: manifest.id }, context)
    ).resolves.toEqual(manifest);
    await expect(
      invokers.executeFrontendTool(
        { toolId: manifest.id, args: { discountPercent: 12 } },
        context
      )
    ).resolves.toEqual({ updated: true });
    expect(calls).toEqual([{ discountPercent: 12 }]);

    unregister();
    await expect(
      invokers.executeFrontendTool({ toolId: manifest.id, args: {} }, context)
    ).resolves.toMatchObject({ status: "error" });
  });

  it("rejects duplicate tools and non-serializable results", async () => {
    const registry = new AIFrontendToolRegistry();
    registry.register("quote-card", {
      name: "update_quote_discount",
      description: "Update discount",
      execute: () => undefined,
    });
    expect(() =>
      registry.register("quote-card", {
        name: "update_quote_discount",
        description: "Duplicate",
        execute: () => undefined,
      })
    ).toThrow(/already registered/);

    registry.register("quote-card", {
      name: "invalid_result",
      description: "Invalid result",
      execute: () => ({ value: 1n }),
    });
    await expect(
      createFrontendToolInvokers(registry).executeFrontendTool(
        { toolId: "quote-card:invalid_result", args: {} },
        {
          ...invocationContext,
          allowedFrontendToolIds: ["quote-card:invalid_result"],
        }
      )
    ).resolves.toMatchObject({ status: "error" });
  });
});
