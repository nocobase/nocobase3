import { describe, expect, it } from "vitest";

import {
  allowsMultipleFiles,
  serializeFileFieldValue,
} from "../form-value";
import { isNocoBaseManagedFileUrl } from "../file-url-policy";
import {
  getAvailableFileCount,
  resolveFileUploadMode,
} from "../upload-strategy";
import {
  matchesFileRules,
  resolveMaxFileSize,
  validateFileForField,
} from "../validation";
import type {
  FileFieldDescriptor,
  FileStorageInfo,
  NocoBaseFileRecord,
} from "../types";

const multiDescriptor: FileFieldDescriptor = {
  sourceCollection: "documents",
  fieldName: "files",
  fileCollection: "files",
  relation: "belongsToMany",
};
const singleDescriptor: FileFieldDescriptor = {
  ...multiDescriptor,
  fieldName: "cover",
  relation: "belongsTo",
};
const localStorage: FileStorageInfo = { id: 1, name: "local", type: "local" };

describe("NocoBase file upload", () => {
  it("selects upload strategies from storage capabilities", () => {
    expect(resolveFileUploadMode(localStorage)).toBe("multipart");
    expect(
      resolveFileUploadMode({ ...localStorage, type: "s3-compatible" })
    ).toBe("direct");
    expect(
      resolveFileUploadMode({
        ...localStorage,
        type: "s3-compatible",
        clientUpload: false,
      })
    ).toBe("multipart");
    expect(resolveFileUploadMode(localStorage, "direct")).toBe("direct");
    expect(getAvailableFileCount(4, 1, 1, 5)).toBe(2);
  });

  it("applies preview policy only to NocoBase-managed URLs", () => {
    const browserUrl = "https://portal.example.com/users";
    const apiUrl = "https://api.example.com/api";
    expect(
      isNocoBaseManagedFileUrl("/storage/files/report.pdf", apiUrl, browserUrl)
    ).toBe(true);
    expect(
      isNocoBaseManagedFileUrl(
        "https://bucket.example.com/report.pdf?X-Amz-Signature=abc",
        apiUrl,
        browserUrl
      )
    ).toBe(false);
  });

  it("serializes values according to the field relation", () => {
    const first: NocoBaseFileRecord = { id: 1, filename: "first.txt" };
    const second: NocoBaseFileRecord = { id: 2, filename: "second.txt" };
    expect(allowsMultipleFiles(multiDescriptor)).toBe(true);
    expect(allowsMultipleFiles(singleDescriptor)).toBe(false);
    expect(serializeFileFieldValue(multiDescriptor, [first, second])).toEqual([
      { id: 1 },
      { id: 2 },
    ]);
    expect(serializeFileFieldValue(singleDescriptor, [first, second])).toEqual({
      id: 1,
    });
  });

  it("uses the strictest field and storage validation rules", () => {
    const image = new File([new Uint8Array(8)], "avatar.png", {
      type: "image/png",
    });
    const text = new File([new Uint8Array(8)], "notes.txt", {
      type: "text/plain",
    });
    const messages = {
      fileSizeExceeded: (size: number) => `too large: ${size}`,
      fieldMimeTypeRejected: "wrong field type",
    };

    expect(matchesFileRules(image, ["image/*", ".pdf"])).toBe(true);
    expect(matchesFileRules(text, ["image/*", ".pdf"])).toBe(false);
    expect(
      resolveMaxFileSize(
        { ...singleDescriptor, maxSize: 20 },
        { ...localStorage, rules: { size: 10 } }
      )
    ).toBe(10);
    expect(
      validateFileForField(
        text,
        { ...singleDescriptor, accept: "image/*" },
        messages
      )
    ).toEqual({
      valid: false,
      code: "mimetype",
      message: "wrong field type",
    });
  });
});
