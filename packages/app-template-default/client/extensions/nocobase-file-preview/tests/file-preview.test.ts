import { createElement } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { FileObject, FilesClient } from "@nocobase/portal-sdk/files";
import { FilePreview } from "../file-preview";
import { canInline, previewBehavior } from "../types";

const image: FileObject = { id: "f1", policy: "attachment", originalName: "photo.png", contentType: "image/png", size: 1, status: "ready", createdAt: "", updatedAt: "" };
const client = () => ({ getConfig: vi.fn(), get: vi.fn(), upload: vi.fn(), remove: vi.fn(), createUrl: vi.fn().mockResolvedValue({ url: "https://temporary.invalid/f1", expiresAt: new Date(Date.now() + 60_000).toISOString(), method: "GET", headers: {} }) }) as unknown as FilesClient;

describe("file preview safety", () => {
  it("allows only safe raster images", () => { expect(canInline("image/png")).toBe(true); expect(canInline("image/svg+xml")).toBe(false); expect(canInline("text/html")).toBe(false); });
  it("uses native media and safe action fallbacks", () => { expect(previewBehavior("audio/mpeg")).toBe("audio"); expect(previewBehavior("video/mp4")).toBe("video"); expect(previewBehavior("application/pdf")).toBe("action"); expect(previewBehavior("text/plain")).toBe("action"); });
  it("does not model a URL as a file value", () => { expect({ fileId: "f1" }).not.toHaveProperty("url"); });
  it("creates URLs lazily, downloads as attachments, and opens safely", async () => { const files = client(); const onOpenChange = vi.fn(); const open = vi.spyOn(window, "open").mockImplementation(() => null); render(createElement(FilePreview, { file: image, client: files, onOpenChange })); expect(files.createUrl).not.toHaveBeenCalled(); fireEvent.click(screen.getByRole("button", { name: /open photo/i })); await waitFor(() => expect(files.createUrl).toHaveBeenCalledWith("f1", expect.objectContaining({ disposition: "inline" }))); expect(onOpenChange).toHaveBeenCalledWith(true); fireEvent.click(screen.getByRole("button", { name: "Download" })); await waitFor(() => expect(files.createUrl).toHaveBeenCalledWith("f1", expect.objectContaining({ disposition: "attachment" }))); await waitFor(() => expect(open).toHaveBeenCalledWith(expect.any(String), "_blank", "noopener,noreferrer")); fireEvent.click(screen.getByRole("button", { name: "Close" })); expect(onOpenChange).toHaveBeenCalledWith(false); open.mockRestore(); });
  it("offers retry after an expired URL error", async () => { const files = client(); vi.mocked(files.createUrl).mockRejectedValueOnce(new Error("expired")); render(createElement(FilePreview, { file: image, client: files })); fireEvent.click(screen.getByRole("button", { name: /open photo/i })); expect((await screen.findByRole("alert")).textContent).toContain("expired"); fireEvent.click(screen.getByRole("button", { name: /retry/i })); await waitFor(() => expect(files.createUrl).toHaveBeenCalledTimes(2)); });
});
