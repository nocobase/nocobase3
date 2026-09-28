// Polling is an explicit environment choice, not a conclusion drawn from a
// short-lived watcher in an unrelated temporary directory.
export function resolveWatchEnvironment(env) {
  if (!['true', '1'].includes(env.CHOKIDAR_USEPOLLING)) return env;

  // The annotations plugin owns a native watcher and cannot honor polling.
  console.log(
    '[dev] Polling file watching explicitly enabled; agent annotations are disabled because their watcher requires native events.',
  );
  return {
    ...env,
    CHOKIDAR_USEPOLLING: 'true',
    CHOKIDAR_INTERVAL: env.CHOKIDAR_INTERVAL || '300',
    AGENT_ANNOTATIONS_ENABLED: 'false',
  };
}
