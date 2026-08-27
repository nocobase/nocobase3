export const APP_STATE_DIRECTORY = '.nb3';

export interface GeneratedAppProjectConfig {
  name: string;
  template: string;
  templateVersion: string;
}

/**
 * Records the generated App's identity and template origin for the nb3 commands
 * that operate on the project after creation.
 */
export function buildAppProjectConfig(
  config: GeneratedAppProjectConfig,
): string {
  return `${JSON.stringify(config, null, 2)}\n`;
}
