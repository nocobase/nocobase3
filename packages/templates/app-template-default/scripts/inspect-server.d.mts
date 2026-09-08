// Hand-written declarations for `inspect-server.mjs`.
//
// The inspector stays JavaScript because it must not be compiled into the server deployment: `dist` has no Vite and no
// browser client, which its client counterpart needs, and the two are kept in the same shape deliberately. These
// declarations exist so the command wrapping it still typechecks.
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
