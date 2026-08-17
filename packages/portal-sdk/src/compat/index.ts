export type PortalTemplateCompatibility = {
  defaultTemplateVersion: string;
  supportedDefaultTemplateRange: string;
  compatible: boolean;
};

export const formatPortalTemplateCompatibilityError = ({
  defaultTemplateVersion,
  sdkVersion,
  supportedDefaultTemplateRange,
}: {
  defaultTemplateVersion: string;
  sdkVersion: string;
  supportedDefaultTemplateRange: string;
}) =>
  [
    "Incompatible NocoBase Portal SDK.",
    `Current Default Template: ${defaultTemplateVersion}`,
    `Portal SDK: ${sdkVersion}`,
    `Supported Default Template range: ${supportedDefaultTemplateRange}`,
    "Upgrade the base template first, or install a compatible @nocobase/portal-sdk version.",
  ].join("\n");
