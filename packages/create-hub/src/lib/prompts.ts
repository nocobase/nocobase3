import * as clack from '@clack/prompts';

export class PromptCancelledError extends Error {
  public constructor() {
    super('Cancelled.');
    this.name = 'PromptCancelledError';
  }
}

function unwrap<T>(value: T | symbol): T {
  if (clack.isCancel(value)) {
    throw new PromptCancelledError();
  }

  return value;
}

export function assertInteractive(): void {
  if (!process.stdin.isTTY) {
    throw new Error(
      'A Hub directory is required, and there is no terminal to prompt on. Pass it as the first argument, for example: pnpm create @nocobase/hub my-hub.',
    );
  }
}

export async function promptDirectory(): Promise<string> {
  assertInteractive();

  const directory = unwrap(
    await clack.text({
      message: 'Where should the Hub be created?',
      placeholder: 'my-hub',
      defaultValue: '',
      validate: (value) =>
        value?.trim() ? undefined : 'A Hub directory is required.',
    }),
  );

  return directory.trim();
}

export const intro: typeof clack.intro = clack.intro;
export const outro: typeof clack.outro = clack.outro;
export const log: typeof clack.log = clack.log;
export const spinner: typeof clack.spinner = clack.spinner;
export const note: typeof clack.note = clack.note;
export const cancel: typeof clack.cancel = clack.cancel;
