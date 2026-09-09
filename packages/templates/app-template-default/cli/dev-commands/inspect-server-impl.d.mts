// Hand-written declarations for `inspect-server-impl.mjs`.
//
// The implementation stays JavaScript, and stays here rather than under `scripts/`, because it belongs to the command
// that wraps it. It is kept out of TypeScript for the same reason its client counterpart is: both were written as
// plain JavaScript, and typing them is a refactor of its own rather than part of moving them.
export interface AppServerInspection {
  readonly app: { readonly packageName: string };
  readonly plugins: readonly {
    readonly packageName: string;
    readonly version: string;
  }[];
  readonly routes: readonly {
    readonly packageName: string;
    readonly scope: string;
  }[];
  readonly database: readonly { readonly packageName: string }[];
  readonly consistent: boolean;
  readonly issues: readonly { readonly message: string }[];
}

export function inspectAppServer(options?: {
  appRoot?: string;
}): Promise<AppServerInspection>;

export function formatAppServerInspection(
  inspection: AppServerInspection,
): string;

export function parseInspectAppServerArgs(args: readonly string[]): {
  help: boolean;
  json: boolean;
};
