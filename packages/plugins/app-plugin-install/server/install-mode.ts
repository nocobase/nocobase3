export const INSTALL_MODE_AUTH_SECRET_PREFIX: string = 'nocobase-install-mode-';

export function isInstallModeAuthSecret(secret: string | undefined): boolean {
  return secret?.startsWith(INSTALL_MODE_AUTH_SECRET_PREFIX) === true;
}
