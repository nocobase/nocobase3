import { createLogging } from '@nocobase/logging';
import type { ChildProcess } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';

/** Capture bounded lines without changing the supervisor's console forwarding policy. */
export function captureChildOutput(
  child: ChildProcess,
  directory: string,
): void {
  const logging = createLogging({
    file: {
      directory,
      name: 'host-output',
      retentionDays: 7,
      maxFileSizeMB: 10,
      maxTotalSizeMB: 100,
    },
    console: { enabled: false },
  });
  const logger = logging.getLogger('child-output');
  for (const [source, stream] of [
    ['stdout', child.stdout],
    ['stderr', child.stderr],
  ] as const) {
    const decoder = new StringDecoder('utf8');
    let pending = '';
    const write = (text: string): void => {
      pending += text;
      while (pending.includes('\n') || pending.length >= 16384) {
        const newline = pending.indexOf('\n');
        const end = newline >= 0 && newline < 16384 ? newline : 16384;
        logger.info({ source }, pending.slice(0, end));
        pending = pending.slice(end + (newline === end ? 1 : 0));
      }
    };
    stream?.on('data', (chunk: Buffer) => write(decoder.write(chunk)));
    stream?.once('end', () => {
      write(decoder.end());
      if (pending) logger.info({ source }, pending);
      pending = '';
    });
  }
  child.once('close', () => {
    void logging.close();
  });
}
