import type { MailAttachment } from "./types";

export function normalizeContentId(value?: string) {
  if (!value) return "";
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    // Keep malformed provider values usable instead of failing the whole body.
  }
  return decoded
    .replace(/^cid:/i, "")
    .replace(/[<>]/g, "")
    .trim()
    .toLocaleLowerCase();
}

function contentIdFromSource(source: string) {
  if (/^cid:/i.test(source)) return normalizeContentId(source);

  try {
    const url = new URL(source.replace(/&amp;/gi, "&"), "https://mail.invalid");
    if (!url.pathname.includes("mail:messageContentPreview")) return "";
    return normalizeContentId(url.searchParams.get("contentId") ?? "");
  } catch {
    return "";
  }
}

const IMAGE_SOURCE_PATTERN = /\bsrc\s*=\s*(["'])([^"']+)\1/gi;

export function collectInlineContentIds(html: string) {
  const ids: string[] = [];
  const seen = new Set<string>();

  for (const match of html.matchAll(IMAGE_SOURCE_PATTERN)) {
    const id = contentIdFromSource(match[2]);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }

  return ids;
}

export function replaceInlineImageSources(
  html: string,
  sourceByContentId: ReadonlyMap<string, string>
) {
  return html.replace(
    IMAGE_SOURCE_PATTERN,
    (attribute, quote: string, source: string) => {
      const contentId = contentIdFromSource(source);
      const replacement = sourceByContentId.get(contentId);
      return replacement ? `src=${quote}${replacement}${quote}` : attribute;
    }
  );
}

export function filterInlineAttachments(
  attachments: MailAttachment[],
  html: string
) {
  const inlineIds = new Set(collectInlineContentIds(html));
  if (!inlineIds.size) return attachments;
  return attachments.filter(
    (attachment) => !inlineIds.has(normalizeContentId(attachment.contentId))
  );
}
