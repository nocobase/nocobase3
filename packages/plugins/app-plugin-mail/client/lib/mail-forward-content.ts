import type { MailMessage } from '../mail-client.js';
import { sanitizeForwardMailHtml } from './mail-message-document.js';
import {
  htmlToPlainText,
  plainTextToMailHtml,
  sanitizeMailHtml,
} from './mail-template.js';

export interface MailForwardQuote {
  readonly id: string;
  readonly accountId: string;
  readonly attachments: MailMessage['attachments'];
  readonly html: string;
  readonly text: string;
}

export interface MailComposerBody {
  readonly html: string;
  readonly text: string;
  readonly forwardQuote?: MailForwardQuote;
}

const QUOTE_START = 'nocobase-mail-forward:start';
const QUOTE_END = 'nocobase-mail-forward:end';

export function createForwardQuote(message: MailMessage): MailForwardQuote {
  return {
    id: message.id,
    accountId: message.accountId,
    attachments: message.attachments,
    html: sanitizeForwardMailHtml(
      message.html || plainTextToMailHtml(message.text ?? ''),
    ),
    text: message.text || htmlToPlainText(message.html ?? '').trim(),
  };
}

export function composeMailBody(body: MailComposerBody): {
  html: string;
  text: string;
} {
  const quote = body.forwardQuote;
  if (!quote) return { html: body.html, text: body.text };
  const document = new DOMParser().parseFromString(
    sanitizeForwardMailHtml(quote.html),
    'text/html',
  );
  const comment = document.createElement('div');
  comment.setAttribute('data-nocobase-mail-comment', '1');
  comment.innerHTML = sanitizeMailHtml(
    body.html || plainTextToMailHtml(body.text),
  );
  // Boundary comments avoid wrapping the original body in another element.
  document.body.prepend(comment, document.createComment(QUOTE_START));
  document.body.append(document.createComment(QUOTE_END));
  return {
    html: `<!doctype html>\n${document.documentElement.outerHTML}`,
    text: [body.text, quote.text].filter(Boolean).join('\n\n'),
  };
}

/** Restores the editable comment without feeding quoted CSS through the editor. */
export function readDraftComposerBody(message: MailMessage): MailComposerBody {
  const html = message.html || plainTextToMailHtml(message.text ?? '');
  const document = new DOMParser().parseFromString(html, 'text/html');
  const comment = document.body.firstElementChild;
  const nodes = [...document.body.childNodes];
  const start = nodes.findIndex(
    (node) => node.nodeType === 8 && node.nodeValue === QUOTE_START,
  );
  const end = nodes
    .map((node) => (node.nodeType === 8 ? node.nodeValue : null))
    .lastIndexOf(QUOTE_END);
  if (
    comment?.getAttribute('data-nocobase-mail-comment') !== '1' ||
    start < 0 ||
    end <= start
  ) {
    return { html, text: message.text ?? '' };
  }
  const commentHtml = sanitizeMailHtml(
    comment.innerHTML +
      nodes
        .slice(end + 1)
        .map((node) => {
          const container = document.createElement('div');
          container.append(node.cloneNode(true));
          return container.innerHTML;
        })
        .join(''),
  );
  document.body.replaceChildren(...nodes.slice(start + 1, end));
  const quoteHtml = sanitizeForwardMailHtml(document.documentElement.outerHTML);
  return {
    html: commentHtml,
    text: htmlToPlainText(commentHtml),
    forwardQuote: {
      id: message.id,
      accountId: message.accountId,
      attachments: message.attachments,
      html: quoteHtml,
      text: htmlToPlainText(document.body.innerHTML).trim(),
    },
  };
}
