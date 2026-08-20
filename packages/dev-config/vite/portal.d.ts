import type { PluginOption, UserConfigExport } from "vite";

export type PortalSdkCompatibilityPluginFactory = (options: {
  root: string;
}) => PluginOption;

export declare const createPortalViteConfig: (
  portalSdkCompatibilityPlugin: PortalSdkCompatibilityPluginFactory,
  localConfig?: UserConfigExport,
) => UserConfigExport;
