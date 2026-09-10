export interface SpaConfig {
  readonly indexPath: string;
  readonly viteDevUrl?: string | null;
  readonly runtime: {
    readonly storagePrefix: string;
    readonly storageType: string;
    readonly shareToken: boolean;
  };
}
