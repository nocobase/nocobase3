export interface MailReplyContent {
  body: string;
  replyBody?: string;
}

const replyQuotePattern =
  /<div\b(?=[^>]*\bdata-role=["']reply-quote["'])[^>]*>\s*<blockquote\b(?=[^>]*\btype=["']cite["'])[^>]*>([\s\S]*?)<\/blockquote>\s*<\/div>\s*$/i;

export function serializeReplyQuote(body: string, replyBody?: string) {
  if (!replyBody) return body;
  return [
    body,
    '<div class="nocobase-quote nb-mail-quote" data-role="reply-quote">',
    '<blockquote type="cite" style="border-left: 1px solid #ccc; padding-left: 8px; margin: 0;">',
    replyBody,
    "</blockquote>",
    "</div>",
  ].join("");
}

export function splitReplyQuote(value: string): MailReplyContent {
  const match = replyQuotePattern.exec(value);
  if (!match || match.index === undefined) return { body: value };
  return {
    body: value.slice(0, match.index),
    replyBody: match[1],
  };
}
