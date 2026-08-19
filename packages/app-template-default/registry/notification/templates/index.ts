import { createHash } from 'node:crypto';

import { Liquid, type Template } from 'liquidjs';
import rehypeParse from 'rehype-parse';
import rehypeSanitize from 'rehype-sanitize';
import rehypeStringify from 'rehype-stringify';
import { unified } from 'unified';
import type { ZodType } from 'zod';

export interface NotificationTemplateDefinition {
  readonly key: string;
  readonly version: string;
  readonly commonSchema: ZodType<Record<string, unknown>>;
  readonly recipientSchema: ZodType<Record<string, unknown>>;
  readonly channels: {
    readonly inApp?: { readonly title: string; readonly body: string; readonly actionUrl?: string };
    readonly email?: { readonly subject: string; readonly text: string; readonly html?: string };
  };
}

export interface RenderNotificationTemplateInput {
  readonly key: string;
  readonly common?: Record<string, unknown>;
  readonly recipient?: Record<string, unknown>;
  readonly identity: { readonly userId?: string; readonly email?: string };
  readonly channels: readonly ('in-app' | 'email')[];
}

export interface RenderedNotificationTemplate {
  readonly key: string;
  readonly version: string;
  readonly contentHash: string;
  readonly inApp?: { readonly title: string; readonly body: string; readonly actionUrl?: string };
  readonly email?: { readonly subject: string; readonly text: string; readonly html?: string };
}

export interface NotificationTemplateRegistry {
  has(key: string): boolean;
  render(input: RenderNotificationTemplateInput): Promise<RenderedNotificationTemplate>;
}

interface CompiledDefinition {
  readonly definition: NotificationTemplateDefinition;
  readonly contentHash: string;
  readonly templates: {
    readonly inApp?: { readonly title: Template[]; readonly body: Template[]; readonly actionUrl?: Template[] };
    readonly email?: { readonly subject: Template[]; readonly text: Template[]; readonly html?: Template[] };
  };
}

const allowedTags = new Set(['if', 'elsif', 'else', 'endif', 'unless', 'endunless', 'case', 'when', 'endcase']);
const allowedFilters = new Set(['escape', 'default', 'upcase', 'downcase']);
const limits = { title: 200, body: 10_000, actionUrl: 2_000, subject: 998, text: 100_000, html: 1_048_576 } as const;
const maxTemplateSourceBytes = 1_048_576;

export function createNotificationTemplateRegistry(definitions: readonly NotificationTemplateDefinition[]): NotificationTemplateRegistry {
  const engine = new Liquid({ strictVariables: true, strictFilters: true, ownPropertyOnly: true, outputEscape: 'escape', lenientIf: false });
  const compiled = new Map<string, CompiledDefinition>();
  for (const definition of definitions) {
    if (!definition.key || !definition.version || compiled.has(definition.key) || (!definition.channels.inApp && !definition.channels.email)) throw new Error(`Invalid or duplicate notification template "${definition.key}".`);
    const sources = collectSources(definition);
    for (const source of sources) {
      if (Buffer.byteLength(source, 'utf8') > maxTemplateSourceBytes) throw new Error(`Notification template "${definition.key}" exceeds its source limit.`);
      validateLiquidSubset(source);
    }
    compiled.set(definition.key, { definition, contentHash: createHash('sha256').update(JSON.stringify(definition.channels)).digest('hex'), templates: compileChannels(engine, definition) });
  }
  return {
    has: (key): boolean => compiled.has(key),
    async render(input): Promise<RenderedNotificationTemplate> {
      const item = compiled.get(input.key);
      if (!item) throw new Error(`Notification template "${input.key}" does not exist.`);
      const common = item.definition.commonSchema.parse(input.common ?? {});
      const recipient = item.definition.recipientSchema.parse(input.recipient ?? {});
      const context = { common, recipient, identity: structuredClone(input.identity) };
      const result: RenderedNotificationTemplate = { key: item.definition.key, version: item.definition.version, contentHash: item.contentHash,
        inApp: input.channels.includes('in-app') ? await renderInApp(engine, item, context) : undefined,
        email: input.channels.includes('email') ? await renderEmail(engine, item, context) : undefined };
      return result;
    },
  };
}

function collectSources(definition: NotificationTemplateDefinition): readonly string[] {
  const sources: string[] = [];
  if (definition.channels.inApp) sources.push(definition.channels.inApp.title, definition.channels.inApp.body, definition.channels.inApp.actionUrl ?? '');
  if (definition.channels.email) sources.push(definition.channels.email.subject, definition.channels.email.text, definition.channels.email.html ?? '');
  return sources;
}

function validateLiquidSubset(source: string): void {
  for (const match of source.matchAll(/{%\s*([a-zA-Z_][\w-]*)/g)) if (!allowedTags.has(match[1])) throw new Error(`Liquid tag "${match[1]}" is not allowed.`);
  for (const match of source.matchAll(/\|\s*([a-zA-Z_][\w-]*)/g)) if (!allowedFilters.has(match[1])) throw new Error(`Liquid filter "${match[1]}" is not allowed.`);
}

function compileChannels(engine: Liquid, definition: NotificationTemplateDefinition): CompiledDefinition['templates'] {
  const inApp = definition.channels.inApp;
  const email = definition.channels.email;
  return {
    inApp: inApp ? { title: engine.parse(inApp.title), body: engine.parse(inApp.body), actionUrl: inApp.actionUrl ? engine.parse(inApp.actionUrl) : undefined } : undefined,
    email: email ? { subject: engine.parse(email.subject), text: engine.parse(email.text), html: email.html ? engine.parse(email.html) : undefined } : undefined,
  };
}

async function renderInApp(engine: Liquid, item: CompiledDefinition, context: Record<string, unknown>): Promise<NonNullable<RenderedNotificationTemplate['inApp']>> {
  if (!item.templates.inApp) throw new Error(`Template "${item.definition.key}" does not define In-app content.`);
  const title = enforceOutput('title', await engine.render(item.templates.inApp.title, context));
  const body = enforceOutput('body', await engine.render(item.templates.inApp.body, context));
  const actionUrl = item.templates.inApp.actionUrl ? enforceOutput('actionUrl', await engine.render(item.templates.inApp.actionUrl, context)) : undefined;
  if (!title || !body || (actionUrl && (!actionUrl.startsWith('/') || actionUrl.startsWith('//')))) throw new Error('Rendered In-app content is invalid.');
  return { title, body, actionUrl };
}

async function renderEmail(engine: Liquid, item: CompiledDefinition, context: Record<string, unknown>): Promise<NonNullable<RenderedNotificationTemplate['email']>> {
  if (!item.templates.email) throw new Error(`Template "${item.definition.key}" does not define Email content.`);
  const subject = enforceOutput('subject', await engine.render(item.templates.email.subject, context));
  const text = enforceOutput('text', await engine.render(item.templates.email.text, context));
  if (!subject || !text || /[\r\n]/.test(subject)) throw new Error('Rendered Email content is invalid.');
  const renderedHtml = item.templates.email.html ? enforceOutput('html', await engine.render(item.templates.email.html, context)) : undefined;
  const html = renderedHtml ? String(await unified().use(rehypeParse, { fragment: true }).use(rehypeSanitize, { tagNames: ['p', 'br', 'strong', 'em', 'ul', 'ol', 'li', 'code', 'pre', 'blockquote', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'a'], attributes: { a: ['href', 'title'] }, protocols: { href: ['http', 'https', 'mailto'] } }).use(rehypeStringify).process(renderedHtml)) : undefined;
  return { subject, text, html };
}

function enforceOutput(kind: keyof typeof limits, value: string): string {
  if (Buffer.byteLength(value, 'utf8') > limits[kind]) throw new Error(`Rendered ${kind} exceeds its output limit.`);
  return value;
}
