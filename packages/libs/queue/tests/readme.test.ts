import { expect, it } from 'vitest';
import { createQueueService } from '../src/index.js';

it('executes the README local completion and unregistration example', async () => {
  const recipients: string[] = [];
  async function sendWelcomeEmail(recipient: string): Promise<void> {
    recipients.push(recipient);
  }
  const queue = createQueueService({ namespace: 'example' });
  let acknowledge: () => void = () => {};
  const delivered = new Promise<void>((resolve) => {
    acknowledge = resolve;
  });
  const unregister = queue
    .consumer('email')
    .consume<{ recipient: string }>(async (channel, message, signal) => {
      if (channel !== 'welcome') return;
      signal.throwIfAborted();
      await sendWelcomeEmail(message.recipient);
      acknowledge();
    });
  try {
    await queue.setup();
    const receipt = await queue.producer('email').publish('welcome', {
      recipient: 'reader@example.com',
    });
    expect(receipt.jobId).toEqual(expect.any(String));
    await delivered;
    expect(recipients).toEqual(['reader@example.com']);
  } finally {
    await unregister();
    await queue.shutdown();
  }
});
