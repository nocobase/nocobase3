import { describe, expect, it } from "vitest";

import {
  formatPortalErrorDiagnostic,
  normalizePortalError,
  redactPortalErrorText,
} from "../error-diagnostics";

describe("Portal error diagnostics", () => {
  it("normalizes render errors", () => {
    expect(normalizePortalError("render failed")).toEqual({
      name: "Error",
      message: "render failed",
    });
  });

  it("redacts credentials and URL details from copyable diagnostics", () => {
    const redacted = redactPortalErrorText(
      "Authorization: Bearer secret-token\nCookie: session=cookie-secret; role=admin\nhttps://example.test/api?token=query-secret&view=all"
    );
    expect(redacted).not.toMatch(
      /secret-token|cookie-secret|role=admin|query-secret|view=all/
    );
    expect(redacted).toMatch(/\[REDACTED\]/);

    const error = new Error(
      "Unable to render https://example.test/chart?access_token=message-secret"
    );
    error.stack = `${error.name}: ${error.message}\n    at Chart (chart.tsx:10:2)`;
    const diagnostic = formatPortalErrorDiagnostic(error, {
      occurredAt: "2026-08-01T12:00:00.000Z",
      route: "/users?token=route-secret#active",
      templateName: "Default Template",
      templateVersion: "2.0.0",
      componentStack: "\n    at Chart (chart.tsx:10:2)",
    });

    expect(diagnostic).toMatch(/Portal runtime error/);
    expect(diagnostic).toMatch(/Route: \/users/);
    expect(diagnostic).toMatch(/Template: Default Template 2\.0\.0/);
    expect(diagnostic).toMatch(/JavaScript stack:/);
    expect(diagnostic).toMatch(/React component stack:/);
    expect(diagnostic).not.toMatch(
      /message-secret|route-secret|access_token=|\?token=/
    );
  });
});
