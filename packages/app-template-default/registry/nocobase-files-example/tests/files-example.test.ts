import { describe, expect, it } from "vitest";
import type { TaskAttachment, DocumentVersion } from "../models";

describe("files examples", () => {
  it("keeps business models separate from file ids", () => { const row: TaskAttachment = { id: "1", task_id: "t", file_id: "f", sort: 0, description: "" }; expect(row.file_id).toBe("f"); });
  it("models document versions in the App", () => { const version: DocumentVersion = { id: "1", document_id: "d", file_id: "f", version: 1, created_at: "" }; expect(version.version).toBe(1); });
});
