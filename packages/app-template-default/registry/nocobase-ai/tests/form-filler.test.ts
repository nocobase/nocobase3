import { describe, expect, it } from "vitest";

import { AIFormRegistry, createFormFillerInvoker } from "../providers/form-registry";

const invocationContext = {
  sessionId: "session-1",
  messageId: "message-1",
  toolCallId: "tool-call-1",
  toolName: "formFiller",
  allowedFormIds: ["lead-form"],
};

describe("AI form filler", () => {
  it("fills only declared editable fields available in the context", async () => {
    const registry = new AIFormRegistry();
    const applied: Array<Record<string, unknown>> = [];
    registry.register({
      id: "lead-form",
      title: "Lead form",
      fields: [
        { name: "company", type: "string" },
        { name: "priority", type: "string", enum: ["normal", "high"] },
        { name: "owner", type: "string", readonly: true },
      ],
      getValues: () => ({}),
      setValues: (values) => {
        applied.push(values);
      },
    });
    const invoke = createFormFillerInvoker(registry);
    const context = invocationContext;

    await expect(
      invoke(
        { form: "lead-form", data: { company: "Acme", priority: "high" } },
        context
      )
    ).resolves.toMatchObject({
      status: "success",
      appliedFields: ["company", "priority"],
      skippedFields: [],
    });
    expect(applied).toEqual([{ company: "Acme", priority: "high" }]);

    await expect(
      invoke(
        { form: "lead-form", data: { company: 42, owner: "Ada" } },
        context
      )
    ).resolves.toMatchObject({
      status: "error",
      skippedFields: [
        expect.objectContaining({ name: "company", reason: "invalid" }),
        expect.objectContaining({ name: "owner", reason: "readonly" }),
      ],
    });
  });

  it("rejects duplicate registrations and inaccessible forms", async () => {
    const registry = new AIFormRegistry();
    const unregister = registry.register({
      id: "lead-form",
      title: "Lead form",
      fields: [],
      getValues: () => ({}),
      setValues: () => undefined,
    });
    expect(() =>
      registry.register({
        id: "lead-form",
        title: "Duplicate",
        fields: [],
        getValues: () => ({}),
        setValues: () => undefined,
      })
    ).toThrow(/already registered/);
    unregister();

    await expect(
      createFormFillerInvoker(registry)(
        { form: "lead-form", data: {} },
        invocationContext
      )
    ).resolves.toMatchObject({ status: "error" });
  });
});
