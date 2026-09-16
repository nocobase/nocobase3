import type { MailMessage } from '../mail-client.js';
import { rewriteMailInlineImages } from './mail-inline-images.js';

const ALLOWED_TAGS = new Set(
  'HTML HEAD BODY TITLE STYLE A ABBR ADDRESS ARTICLE ASIDE B BDI BDO BLOCKQUOTE BR CAPTION CENTER CITE CODE COL COLGROUP DD DEL DETAILS DFN DIV DL DT EM FIGCAPTION FIGURE FONT FOOTER H1 H2 H3 H4 H5 H6 HEADER HR I IMG INS KBD LI MAIN MARK NAV OL P PRE Q S SAMP SECTION SMALL SPAN STRIKE STRONG SUB SUMMARY SUP TABLE TBODY TD TFOOT TH THEAD TIME TR TT U UL VAR WBR'.split(
    ' ',
  ),
);
const REMOVED_TAGS = new Set(
  'SCRIPT NOSCRIPT IFRAME FRAME FRAMESET OBJECT EMBED APPLET SVG MATH LINK META BASE TEMPLATE INPUT BUTTON SELECT TEXTAREA'.split(
    ' ',
  ),
);
const FORMATTING_ATTRIBUTES = new Set(
  'id class style title lang dir align valign width height bgcolor border cellpadding cellspacing colspan rowspan span color face size nowrap hspace vspace text link alink vlink'.split(
    ' ',
  ),
);

/** For a script-disabled sandboxed iframe only; never inject into the App DOM. */
export function createMailMessageDocument(
  message: Pick<MailMessage, 'accountId' | 'id' | 'attachments'>,
  html: string,
  scope: 'personal' | 'management' = 'personal',
): string {
  const document = new DOMParser().parseFromString(html, 'text/html');
  rewriteMailInlineImages(document, message, scope);
  sanitizeElement(document.documentElement);

  const policy = document.createElement('meta');
  policy.httpEquiv = 'Content-Security-Policy';
  policy.content =
    "default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src http: https: data:; font-src data:; base-uri 'none'; form-action 'none'";
  const referrer = document.createElement('meta');
  referrer.name = 'referrer';
  referrer.content = 'no-referrer';
  const defaults = document.createElement('style');
  // Email colors and typography belong to the sender, independently of the App theme.
  defaults.textContent =
    'html { color-scheme: light; color: #111; background: #fff; font: 14px/1.5 Arial, sans-serif; } body { margin: 0; padding: 0; } img { max-width: 100%; }';
  document.head.prepend(policy, referrer, defaults);
  return `<!doctype html>\n${document.documentElement.outerHTML}`;
}

/** Preserves mail formatting for delivery; render only inside a sandboxed frame. */
export function sanitizeForwardMailHtml(html: string): string {
  const document = new DOMParser().parseFromString(html, 'text/html');
  sanitizeElement(document.documentElement, true);
  return `<!doctype html>\n${document.documentElement.outerHTML}`;
}

function sanitizeElement(element: Element, allowContentId = false): void {
  for (const attribute of [...element.attributes]) {
    const name = attribute.name.toLowerCase();
    const link =
      element.tagName === 'A' &&
      name === 'href' &&
      /^(?:https?:|mailto:|tel:|#)/iu.test(attribute.value.trim());
    const image =
      ((element.tagName === 'IMG' && name === 'src') ||
        name === 'background') &&
      (/^(?:https?:|\/(?!\/)|data:image\/(?:gif|jpe?g|png|webp);base64,)/iu.test(
        attribute.value.trim(),
      ) ||
        (allowContentId && /^cid:/iu.test(attribute.value.trim())));
    const imageText = element.tagName === 'IMG' && name === 'alt';
    if (!FORMATTING_ATTRIBUTES.has(name) && !link && !image && !imageText)
      element.removeAttribute(attribute.name);
  }
  if (element.tagName === 'A' && element.hasAttribute('href')) {
    element.setAttribute('target', '_blank');
    element.setAttribute('rel', 'noopener noreferrer');
  }
  for (const child of [...element.children]) {
    if (REMOVED_TAGS.has(child.tagName)) {
      child.remove();
      continue;
    }
    sanitizeElement(child, allowContentId);
    if (!ALLOWED_TAGS.has(child.tagName))
      child.replaceWith(...child.childNodes);
  }
}
