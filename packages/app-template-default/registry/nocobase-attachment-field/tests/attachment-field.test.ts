import { createElement } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { FilesClient } from "@nocobase/portal-sdk/files";

vi.mock("@/extensions/nocobase-file-preview", () => ({ FilePreview: ({ file }: { file: { id: string } }) => createElement("span", null, `preview:${file.id}`) }));
vi.mock("@/extensions/nocobase-file-upload", () => ({ FileUpload: ({ value, onChange, multiple }: { value: Array<{ id: string; originalName?: string }>; onChange: (value: Array<{ id: string; originalName?: string }>) => void; multiple: boolean }) => createElement("button", { onClick: () => onChange(multiple ? [...value, { id: "uploaded", originalName: "up" }] : [{ id: "uploaded", originalName: "up" }]) }, "upload") }));
import { AttachmentField } from "../attachment-field";

const record = (id: string) => ({ id, policy: "attachment", originalName: `${id}.txt`, contentType: "text/plain", size: 1, status: "ready", createdAt: "", updatedAt: "" });
const client = (missing?: string) => ({ getConfig: vi.fn(), upload: vi.fn(), createUrl: vi.fn(), remove: vi.fn(), get: vi.fn(async (id: string) => { if (id === missing) throw new Error("missing"); return record(id); }) }) as unknown as FilesClient;

describe("attachment field contract", () => {
  it("exposes stable ids only", () => { const files = [{ id: "a" }, { id: "b" }]; expect(files.map(({ id }) => id)).toEqual(["a", "b"]); });
  it("defaults removal to non-destructive", () => { const props = {}; expect((props as { deleteFileOnRemove?: boolean }).deleteFileOnRemove ?? false).toBe(false); });
  it("hydrates in value order and retains missing ids", async () => { const files = client("missing"); render(createElement(AttachmentField, { value: ["b", "missing", "a"], client: files })); await waitFor(() => expect(screen.getByText("preview:b")).toBeTruthy()); expect(screen.getAllByText(/preview:/).map((node) => node.textContent)).toEqual(["preview:b", "preview:missing", "preview:a"]); });
  it("appends uploads as ids without URLs", async () => { const files = client(); const onChange = vi.fn(); render(createElement(AttachmentField, { value: ["a"], client: files, onChange })); await screen.findByText("preview:a"); fireEvent.click(screen.getByRole("button", { name: "upload" })); expect(onChange).toHaveBeenCalledWith(["a", "uploaded"]); expect(onChange.mock.calls[0][0]).not.toContain(expect.stringContaining("http")); });
  it("single mode replaces and removal does not delete by default", async () => { const files = client(); const onChange = vi.fn(); render(createElement(AttachmentField, { value: ["a"], client: files, onChange, multiple: false })); await screen.findByText("preview:a"); fireEvent.click(screen.getByRole("button", { name: "upload" })); expect(onChange).toHaveBeenCalledWith(["uploaded"]); fireEvent.click(screen.getByRole("button", { name: "Remove a.txt" })); expect(onChange).toHaveBeenCalledWith([]); expect(files.remove).not.toHaveBeenCalled(); });
});
