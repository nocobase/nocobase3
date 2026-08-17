import { describe, expect, it } from "vitest";

import { createDebouncedDraftSaver } from "../components/mail-draft-autosave";
import {
  collectInlineContentIds,
  filterInlineAttachments,
  replaceInlineImageSources,
} from "../components/mail-inline-images";
import {
  collectMessageMailIds,
  isMessageUnread,
  markMessageRead,
  markMessageUnread,
} from "../components/mail-inbox";
import {
  appendRecipient,
  currentToken,
  mergeRecipients,
} from "../components/mail-recipient-input";
import { createMailUnreadPollingSubscription } from "../components/mail-unread-subscription";

describe("Mail interaction utilities", () => {
  it("normalizes recipient input", () => {
    expect(currentToken("alice@example.com, bo")).toBe("bo");
    expect(
      appendRecipient("alice@example.com, bo", "bob@example.com")
    ).toBe("alice@example.com, bob@example.com");
    expect(
      mergeRecipients(
        "alice@example.com",
        "bob@example.com; ALICE@example.com, carol@example.com"
      )
    ).toBe("alice@example.com, bob@example.com, carol@example.com");
  });

  it("debounces draft saves", async () => {
    const saved: Array<Record<string, unknown>> = [];
    const saver = createDebouncedDraftSaver(
      async (payload: Record<string, unknown>) => {
        saved.push(payload);
      },
      5
    );
    saver.schedule({ subject: "First version" });
    saver.schedule({ subject: "Latest version" });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(saved).toEqual([{ subject: "Latest version" }]);
    saver.cancel();
  });

  it("replaces inline image sources and hides inline attachments", () => {
    const html = [
      '<p><img src="cid:<Hero.Image@Mail>"></p>',
      '<img src="/api/mail:messageContentPreview?messageId=7&amp;contentId=logo%40mail">',
    ].join("");
    expect(collectInlineContentIds(html)).toEqual([
      "hero.image@mail",
      "logo@mail",
    ]);
    expect(
      replaceInlineImageSources(
        html,
        new Map([
          ["hero.image@mail", "blob:hero"],
          ["logo@mail", "blob:logo"],
        ])
      )
    ).toBe('<p><img src="blob:hero"></p><img src="blob:logo">');
    expect(
      filterInlineAttachments(
        [
          {
            attachmentId: "inline",
            filename: "hero.png",
            mimeType: "image/png",
            contentId: "<Hero.Image@Mail>",
          },
          {
            attachmentId: "file",
            filename: "report.pdf",
            mimeType: "application/pdf",
          },
        ],
        html
      ).map((attachment) => attachment.attachmentId)
    ).toEqual(["file"]);
  });

  it("updates unread state for complete conversations", () => {
    const message = {
      id: 1,
      mailId: "message-1",
      isRead: true,
      relatedMessagesIsRead: false,
    };
    expect(isMessageUnread(message as any)).toBe(true);
    expect(
      collectMessageMailIds({
        ...message,
        relatedMessageIds: ["message-2"],
        children: [{ ...message, id: 2, mailId: "message-3" }],
      } as any)
    ).toEqual(["message-1", "message-2", "message-3"]);
    expect(markMessageRead(message as any)).toMatchObject({
      isRead: true,
      relatedMessagesIsRead: true,
    });
    expect(markMessageUnread(message as any)).toMatchObject({
      isRead: false,
      relatedMessagesIsRead: false,
    });
  });

  it("shares one unread polling lifecycle across subscribers", () => {
    const transitions: boolean[] = [];
    const subscribe = createMailUnreadPollingSubscription((active) =>
      transitions.push(active)
    );
    const first = subscribe();
    const second = subscribe();
    first();
    second();
    second();
    expect(transitions).toEqual([true, false]);
  });
});
