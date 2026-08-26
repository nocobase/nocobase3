export interface RuntimeLogger {
  trace(message: string, context?: Record<string, unknown>): void;
  trace(context: Record<string, unknown>, message?: string): void;
  debug?(message: string, context?: Record<string, unknown>): void;
  debug?(context: Record<string, unknown>, message?: string): void;
  info?(message: string, context?: Record<string, unknown>): void;
  info?(context: Record<string, unknown>, message?: string): void;
  warn(message: string, context?: Record<string, unknown>): void;
  warn(context: Record<string, unknown>, message?: string): void;
  error(message: string, context?: Record<string, unknown>): void;
  error(context: Record<string, unknown>, message?: string): void;
}
