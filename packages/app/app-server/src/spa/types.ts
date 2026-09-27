export type SpaHandler = (request: Request) => Response | Promise<Response>;

export type SpaClientConfigValue =
  | string
  | number
  | boolean
  | null
  | readonly SpaClientConfigValue[]
  | SpaClientConfigMap;

export interface SpaClientConfigMap {
  readonly [key: string]: SpaClientConfigValue;
}

export interface RegisterSpaRoutesOptions {
  basePath: string;
  handler?: SpaHandler;
  indexPath: string;
  assetsPath?: string;
  clientConfig?: SpaClientConfigMap;
  /**
   * Values the server publishes, sent beside `clientConfig` rather than merged into it and read in the browser through
   * `config.public`. A function is called for every page, so a configuration reload reaches the next page load.
   */
  publicConfig?: SpaClientConfigMap | (() => SpaClientConfigMap);
}
