export interface DeploymentEvent {
  readonly sequence: number;
  readonly at: string;
  readonly phase: string;
  readonly message: string;
  readonly durationMs?: number;
  readonly failedPhase?: string;
}
export type DeploymentReporter = (
  phase: string,
  message: string,
  durationMs?: number,
) => void;

/** Bound and redact diagnostics before they cross the management boundary. */
export function redactDeploymentDiagnostic(value: string): string {
  return value
    .replace(/-----BEGIN[\s\S]*?-----END[^\n]*-----/g, '[redacted key]')
    .replace(
      /([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+(?::[^\s/@]*)?@/gi,
      '$1[redacted]@',
    )
    .replace(
      /((?:password|passwd|secret|token|authorization|api[_-]?key|credential)[\w-]*["']?\s*[:=]\s*)(?:"[^"\n]*"|'[^'\n]*'|[^\s,;]+)/gi,
      '$1[redacted]',
    )
    .replace(/Bearer\s+[^\s,;]+/gi, 'Bearer [redacted]')
    .split(String.fromCharCode(27))
    .join('')
    .slice(0, 2000);
}
