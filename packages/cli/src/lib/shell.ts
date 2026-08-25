const SAFE_SHELL_ARGUMENT = /^[A-Za-z0-9_./:@%+=,-]+$/;

export function formatShellCommand(arguments_: readonly string[]): string {
  return arguments_.map(quoteShellArgument).join(' ');
}

function quoteShellArgument(value: string): string {
  if (value && SAFE_SHELL_ARGUMENT.test(value)) return value;
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}
