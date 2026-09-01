export function resolveInstalledDestination(
  configurationSaved: boolean,
): '/' | '/login' {
  return configurationSaved ? '/' : '/login';
}
