import { describe, expect, it } from "vitest";

import {
  createAIPageContextReference,
  getAIWorkContextRequiredTools,
  mergeAIRequiredTools,
} from "../providers/page-context";

describe("AI page context", () => {
  it("derives the tools required by contextual form references", () => {
    const formContext = createAIPageContextReference({
      id: "lead-form",
      title: "Lead form",
      kind: "form",
    });
    expect(formContext).toEqual({
      type: "page-element",
      id: "lead-form",
      title: "Lead form",
      kind: "form",
    });
    expect(getAIWorkContextRequiredTools([formContext])).toEqual([
      "formFiller",
    ]);
    expect(
      mergeAIRequiredTools(
        { skills: ["lead-review"], tools: ["inspect-record"] },
        ["formFiller", "inspect-record"]
      )
    ).toEqual({
      skills: ["lead-review"],
      tools: ["inspect-record", "formFiller"],
    });
  });
});
