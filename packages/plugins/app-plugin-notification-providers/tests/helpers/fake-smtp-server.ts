import { once } from 'node:events';
import { createServer, type AddressInfo } from 'node:net';

export interface FakeSmtpServer {
  readonly messages: string[];
  readonly port: number;
  close(): Promise<void>;
}

export async function createFakeSmtpServer(): Promise<FakeSmtpServer> {
  const messages: string[] = [];
  const server = createServer((socket) => {
    socket.setEncoding('utf8');
    socket.write('220 localhost ESMTP test server\r\n');
    let pending = '';
    let receivingMessage = false;
    const messageLines: string[] = [];

    socket.on('data', (chunk: string) => {
      pending += chunk;
      let newline = pending.indexOf('\r\n');
      while (newline >= 0) {
        const line = pending.slice(0, newline);
        pending = pending.slice(newline + 2);
        if (receivingMessage) {
          if (line === '.') {
            receivingMessage = false;
            messages.push(messageLines.join('\r\n'));
            messageLines.length = 0;
            socket.write('250 2.0.0 queued as test-message-id\r\n');
          } else {
            messageLines.push(line.startsWith('..') ? line.slice(1) : line);
          }
        } else if (line.startsWith('EHLO ') || line.startsWith('HELO ')) {
          socket.write('250-localhost\r\n250 SIZE 52428800\r\n');
        } else if (line.startsWith('MAIL FROM:')) {
          socket.write('250 2.1.0 sender accepted\r\n');
        } else if (line.startsWith('RCPT TO:')) {
          socket.write('250 2.1.5 recipient accepted\r\n');
        } else if (line === 'DATA') {
          receivingMessage = true;
          socket.write('354 end with <CRLF>.<CRLF>\r\n');
        } else if (line === 'RSET' || line === 'NOOP') {
          socket.write('250 2.0.0 ok\r\n');
        } else if (line === 'QUIT') {
          socket.end('221 2.0.0 closing connection\r\n');
        } else {
          socket.write('500 5.5.1 unsupported SMTP command\r\n');
        }
        newline = pending.indexOf('\r\n');
      }
    });
  });

  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address() as AddressInfo;

  return {
    messages,
    port: address.port,
    async close(): Promise<void> {
      server.close();
      await once(server, 'close');
    },
  };
}
