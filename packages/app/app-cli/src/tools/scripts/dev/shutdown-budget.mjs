/**
 * The shutdown budget the development server runs with.
 *
 * `tsx watch` sends SIGTERM and force-kills after five seconds, so the
 * deployment defaults — a 30 second HTTP drain, a 35 second force exit — are
 * unreachable here: a slower shutdown is always SIGKILLed, which skips
 * releasing the migration lock. Four seconds leaves the escalation unused.
 */
export const DEV_SHUTDOWN_TIMEOUT_MS = 4000;

export const SHUTDOWN_TIMEOUT_ENV = 'APP_SHUTDOWN_TIMEOUT_MS';

/** An explicit value from the environment wins; this only supplies a default. */
export function resolveDevShutdownEnv(env) {
  const configured = env[SHUTDOWN_TIMEOUT_ENV];
  return {
    [SHUTDOWN_TIMEOUT_ENV]:
      configured && configured.trim()
        ? configured
        : String(DEV_SHUTDOWN_TIMEOUT_MS),
  };
}
