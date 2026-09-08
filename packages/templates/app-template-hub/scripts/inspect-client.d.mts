// Hand-written declarations for `inspect-client.mjs`.
//
// The inspector stays JavaScript because it loads Vite and browser-only client modules to read client declarations,
// neither of which exists in the server deployment. Compiling it would pull DOM types into the server project and
// produce output that could never run there. These declarations exist so the command wrapping it still typechecks.
export interface AppClientInspection {
  readonly app: { readonly packageName: string };
  readonly [section: string]: unknown;
}

export function inspectAppClient(options?: {
  appRoot?: string;
}): Promise<AppClientInspection>;

export function formatAppClientInspection(
  inspection: AppClientInspection,
  type?: string,
): string;

export function createAppClientInspectionSuccess(
  inspection: AppClientInspection,
  type?: string,
): Record<string, unknown>;
