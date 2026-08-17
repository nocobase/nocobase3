import { describe, expect, it } from "vitest";

import {
  buildComposeInitial,
  canReplyAll,
} from "../components/use-mail-compose";
import {
  serializeReplyQuote,
  splitReplyQuote,
} from "../components/mail-reply-quote";
import { MailBoxType, type MailMessage } from "../components/types";

const sourceMessage: MailMessage = {
  id: 1,
  email: "team@example.com",
  identityEmail: "sales@example.com",
  mailId: "message-1",
  rawId: "raw-1",
  boxType: MailBoxType.IN,
  isRead: false,
  isDraft: false,
  from: "customer@example.com",
  to: "sales@example.com, colleague@example.com",
  toUsers: [
    { address: "SALES@example.com" },
    { address: "colleague@example.com" },
  ],
  cc: "observer@example.com",
  ccUsers: [{ address: "observer@example.com" }],
  bcc: "",
  subject: "Question",
  date: "2026-07-27T10:00:00.000Z",
  bodyText: "Hello",
  bodyHtml: "<p>Hello</p>",
  attachments: [],
};

describe("Mail compose", () => {
  it("builds a reply-all without mixing quoted HTML into the editor", () => {
    const reply = buildComposeInitial(sourceMessage, "replyAll", [
      "team@example.com",
      "sales@example.com",
    ]);
    expect(reply).toMatchObject({
      accountEmail: "team@example.com",
      identityEmail: "sales@example.com",
      to: "customer@example.com, colleague@example.com",
      cc: "observer@example.com",
      body: "",
      replyBody: "<p>Hello</p>",
    });
    expect(reply.reference).toMatchObject({
      from: "customer@example.com",
      subject: "Question",
      html: "<p>Hello</p>",
    });
    expect(
      canReplyAll(sourceMessage, ["team@example.com", "sales@example.com"])
    ).toBe(true);

    const serialized = serializeReplyQuote(
      reply.body ?? "",
      reply.replyBody ?? ""
    );
    expect(serialized).toMatch(/data-role="reply-quote"/);
    expect(serialized).toMatch(/<blockquote type="cite"/);
    expect(splitReplyQuote(`<p>Thanks<\/p>${serialized}`)).toEqual({
      body: "<p>Thanks</p>",
      replyBody: "<p>Hello</p>",
    });
  });

  it("keeps original formatted HTML in reply references", () => {
    const bodyHtml =
      '<div><strong>Formatted sender</strong><p style="color:red">Original content</p></div>';
    const reply = buildComposeInitial(
      { ...sourceMessage, bodyHtml, bodyText: "Formatted sender Original content" },
      "reply"
    );
    expect(reply.replyBody).toBe(bodyHtml);
    expect(reply.reference?.html).toBe(bodyHtml);
  });

  it("rejects provider-backed drafts from the local draft workflow", () => {
    expect(() =>
      buildComposeInitial(
        {
          ...sourceMessage,
          id: 8,
          isDraft: true,
          mailId: "provider-draft",
          rawId: "raw-draft",
        },
        "draft"
      )
    ).toThrow(/read-only/);
  });
});
