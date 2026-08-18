import { describe, expect, it } from "vitest";
import { validateObjectKey } from "../../src/storage/object-key.ts";
describe("object keys", () => { it("rejects traversal and controls", () => { for (const key of ["../secret", "foo/../../secret", "/absolute", "foo\\bar", "a\0b", "a\nb"]) expect(() => validateObjectKey(key)).toThrow(); expect(validateObjectKey("foo/%2e%2e/bar")).toBe("foo/%2e%2e/bar"); }); it("accepts generated key", () => expect(validateObjectKey("w/ws_1/objects/file_1")).toBe("w/ws_1/objects/file_1")); });
