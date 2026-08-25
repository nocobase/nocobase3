export type SpaHandler = (request: Request) => Response | Promise<Response>;

export type SpaRuntimeGlobalValue =
  | string
  | number
  | boolean
  | null
  | SpaRuntimeGlobalValue[]
  | { [key: string]: SpaRuntimeGlobalValue };

export type SpaRuntimeGlobals = Record<
  string,
  SpaRuntimeGlobalValue | undefined
>;

export interface RegisterSpaRoutesOptions {
  basePath: string;
  handler?: SpaHandler;
  indexPath: string;
  assetsPath?: string;
  runtimeGlobals?: SpaRuntimeGlobals;
}
