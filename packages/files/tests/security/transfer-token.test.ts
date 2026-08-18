import { describe, expect, it } from "vitest";
import { signTransferToken, verifyTransferToken } from "../../src/security/transfer-token.ts";
describe("transfer token", () => { const payload = { version: 1 as const, action: "upload" as const, workspaceId: "w", subjectId: "u", expiresAt: 100, expectedSize: 2, contentType: "text/plain" }; it("signs and verifies", () => expect(verifyTransferToken(signTransferToken(payload, "secret"), "secret", { action: "upload", workspaceId: "w", subjectId: "u" }, () => 1)).toMatchObject(payload)); it("rejects tamper, expiry and mismatches", () => { const token = signTransferToken(payload, "secret"); expect(() => verifyTransferToken(`${token}x`, "secret", { action: "upload", workspaceId: "w", subjectId: "u" }, () => 1)).toThrow(); expect(() => verifyTransferToken(token, "secret", { action: "read", workspaceId: "w", subjectId: "u" }, () => 1)).toThrow(); expect(() => verifyTransferToken(token, "secret", { action: "upload", workspaceId: "w", subjectId: "u" }, () => 100)).toThrow(); }); });

it("binds read tokens to workspace, file, expiry, action, and disposition", () => {
  const payload = { version: 1 as const, action: "read" as const, workspaceId: "w", subjectId: "f", expiresAt: 100, disposition: "attachment" as const };
  const token = signTransferToken(payload, "secret");
  expect(verifyTransferToken(token, "secret", { action: "read", workspaceId: "w", subjectId: "f" }, () => 1)).toEqual(payload);
  expect(() => verifyTransferToken(token, "secret", { action: "read", workspaceId: "other", subjectId: "f" }, () => 1)).toThrow();
  expect(() => verifyTransferToken(signTransferToken({ ...payload, disposition: undefined }, "secret"), "secret", { action: "read", workspaceId: "w", subjectId: "f" }, () => 1)).toThrow();
});
