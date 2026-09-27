import { HUB_TEMPLATE, TEMPLATES, type TemplateDefinition } from './layout.ts';
import type { InstallerState } from './state.ts';

/** The template an installation is built from, or `undefined` for one installed from deployment archives. */
export function templateOf(
  state: Pick<InstallerState, 'source'>,
): TemplateDefinition | undefined {
  const { source } = state;
  return source.kind === 'template'
    ? TEMPLATES.find((template) => template.name === source.template)
    : undefined;
}

/** How messages name what is installed: `the Hub`, or `the application`. */
export function subjectOf(state: Pick<InstallerState, 'source'>): string {
  const template = templateOf(state);
  return template ? `the ${template.title}` : 'the application';
}

/**
 * Whether stopping this installation stops other applications too. A Hub hosts applications of its own, which stop
 * with it and have to be rebuilt when its Node major changes.
 */
export function hostsApplications(
  state: Pick<InstallerState, 'source'>,
): boolean {
  return templateOf(state) === HUB_TEMPLATE;
}

/** The first letter upper-cased, for a subject at the start of a sentence. */
export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
