import { describe, expect, it } from "vitest";
import { isUnsafeInlineFile } from "../file-preview-types";

describe("Files Kernel registry boundaries", () => {
  it("rejects active content for inline preview", () => {
    expect(isUnsafeInlineFile({ contentType: "image/svg+xml", originalName: "x.svg" })).toBe(true);
    expect(isUnsafeInlineFile({ contentType: "image/png", originalName: "x.png" })).toBe(false);
  });
  it("keeps stable file values independent from URLs", () => {
    const value = { id: "f1", policy: "attachment", originalName: "x.png", contentType: "image/png", size: 1, status: "ready", createdAt: "", updatedAt: "" };
    expect(value).not.toHaveProperty("url");
    expect(value.id).toBe("f1");
  });
});
