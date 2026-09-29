// Reading a secret without echoing it, and reading one piped in.

/** Reads all of standard input. */
export async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin)
    chunks.push(Buffer.from(chunk as Uint8Array));
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * Asks on stderr and reads one line from the terminal with echo off. Stderr, so a `--json` document on stdout stays
 * the only thing there.
 */
export function promptHidden(question: string): Promise<string> {
  const stdin = process.stdin;
  return new Promise((resolve, reject) => {
    let value = '';
    const finish = (error?: Error): void => {
      stdin.off('data', onData);
      stdin.setRawMode(false);
      stdin.pause();
      process.stderr.write('\n');
      if (error) reject(error);
      else resolve(value);
    };
    const onData = (chunk: Buffer): void => {
      for (const character of chunk.toString('utf8')) {
        if (
          character === '\r' ||
          character === '\n' ||
          character === '\u0004'
        ) {
          finish();
          return;
        }
        if (character === '\u0003') {
          finish(new Error('Cancelled'));
          return;
        }
        if (character === '\u007f' || character === '\b')
          value = value.slice(0, -1);
        else value += character;
      }
    };
    process.stderr.write(question);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on('data', onData);
  });
}
