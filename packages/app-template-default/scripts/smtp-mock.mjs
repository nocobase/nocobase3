import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';

const host = process.env.SMTP_HOST || '127.0.0.1';
const port = Number(process.env.SMTP_PORT || 1025);
const outputDir = path.resolve(
  process.env.SMTP_MOCK_OUTPUT_DIR || 'storage/smtp-mock',
);

fs.mkdirSync(outputDir, { recursive: true });

const server = net.createServer((socket) => {
  let buffer = '';
  let dataMode = false;
  let message = '';
  let sender = '';
  const recipients = [];

  const reply = (line) => socket.write(`${line}\r\n`);

  const reset = () => {
    dataMode = false;
    message = '';
    sender = '';
    recipients.length = 0;
  };

  const acceptMessage = () => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${timestamp}-${Math.random().toString(36).slice(2, 8)}.eml`;
    const file = path.join(outputDir, filename);
    fs.writeFileSync(file, message.replace(/^\.\./gm, '.'));
    console.log(
      `[smtp-mock] accepted from=${sender || '-'} to=${recipients.join(',') || '-'} file=${file}`,
    );
    reset();
    reply('250 2.0.0 Message accepted for local delivery');
  };

  const handleCommand = (line) => {
    const [command = ''] = line.trim().split(/\s+/, 1);
    const upper = command.toUpperCase();

    if (upper === 'EHLO' || upper === 'HELO') {
      socket.write('250-localhost\r\n250-8BITMIME\r\n250 SIZE 10485760\r\n');
    } else if (upper === 'MAIL') {
      sender = line.slice(line.indexOf(':') + 1).trim();
      reply('250 2.1.0 Sender accepted');
    } else if (upper === 'RCPT') {
      recipients.push(line.slice(line.indexOf(':') + 1).trim());
      reply('250 2.1.5 Recipient accepted');
    } else if (upper === 'DATA') {
      dataMode = true;
      reply('354 End data with <CR><LF>.<CR><LF>');
    } else if (upper === 'RSET') {
      reset();
      reply('250 2.0.0 Reset');
    } else if (upper === 'NOOP') {
      reply('250 2.0.0 OK');
    } else if (upper === 'QUIT') {
      reply('221 2.0.0 Bye');
      socket.end();
    } else {
      reply('250 2.0.0 OK');
    }
  };

  socket.setEncoding('utf8');
  reply('220 localhost ESMTP NocoBase mock');
  socket.on('data', (chunk) => {
    buffer += chunk;
    while (buffer.length > 0) {
      const end = buffer.indexOf('\r\n');
      if (end < 0) break;
      const line = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      if (!dataMode) {
        handleCommand(line);
      } else if (line === '.') {
        acceptMessage();
      } else {
        message += `${line}\r\n`;
      }
    }
  });
  socket.on('error', () => undefined);
});

server.listen(port, host, () => {
  console.log(`[smtp-mock] listening on smtp://${host}:${port}`);
  console.log(`[smtp-mock] messages are saved to ${outputDir}`);
});

const shutdown = () => server.close(() => process.exit(0));
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
