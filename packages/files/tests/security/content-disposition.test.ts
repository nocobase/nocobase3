import { describe, expect, it } from "vitest";
import { contentDisposition } from "../../src/security/content-disposition.ts";

describe("Content-Disposition", () => {
  it("keeps names in one safe RFC 5987 header", () => {
    for (const name of ["normal.pdf", '"quoted".pdf', "../../evil.pdf", "中文合同.pdf", "name\r\nInjected: x"]) {
      const header = contentDisposition("attachment", name);
      expect(header).toMatch(/^attachment; filename="[^"\\\r\n]*"; filename\*=UTF-8''/);
      expect(header).not.toMatch(/[\r\n\0]/);
    }
    expect(contentDisposition("inline", "../../evil.pdf")).toContain('filename="evil.pdf"');
    expect(contentDisposition("attachment", "中文合同.pdf")).toContain("filename*=UTF-8''%E4%B8%AD%E6%96%87%E5%90%88%E5%90%8C.pdf");
  });
});
