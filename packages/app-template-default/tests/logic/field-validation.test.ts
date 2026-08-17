import { describe, expect, it } from "vitest";

import { validateFieldValidationControllers } from "@/lib/field-validation";

describe("field validation controllers", () => {
  it("stops at the first validation error", async () => {
    const calls: string[] = [];
    const result = await validateFieldValidationControllers([
      {
        validate: () => {
          calls.push("first");
          return true;
        },
      },
      {
        validate: async () => {
          calls.push("second");
          return "Upload is still in progress";
        },
      },
      {
        validate: () => {
          calls.push("third");
          return true;
        },
      },
    ]);

    expect(result).toBe("Upload is still in progress");
    expect(calls).toEqual(["first", "second"]);
  });
});
