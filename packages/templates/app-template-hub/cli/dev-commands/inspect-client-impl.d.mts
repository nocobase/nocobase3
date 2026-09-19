// Hand-written declarations for `inspect-client-impl.mjs`.
//
// The implementation stays JavaScript, and stays here rather than under `scripts/`, because it belongs to the command
// that wraps it. It reads client declarations through Vite and browser-only client modules, which is why the whole
// directory is excluded from the server build.
export interface AppClientInspection {
  readonly app: { readonly packageName: string };
  readonly [section: string]: unknown;
}

export class ClientInspectionError extends Error {
  readonly code: string;
}

export function inspectAppClient(options?: {
  appRoot?: string;
}): Promise<AppClientInspection>;

export function formatAppClientInspection(
  inspection: AppClientInspection,
  type?: string,
): string;

export function selectAppClientInspection(
  inspection: AppClientInspection,
  type?: string,
): Record<string, unknown>;

export function createAppClientInspectionSuccess(
  inspection: AppClientInspection,
  type?: string,
): Record<string, unknown>;

export function createAppClientInspectionFailure(
  error: unknown,
): Record<string, unknown>;

export function parseInspectAppClientArgs(args: readonly string[]): {
  help: boolean;
  json: boolean;
  type: string;
};
