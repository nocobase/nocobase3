/**
 * What the example's effects call. A real application passes its own mail
 * and payment services here; the example stands them in with log lines.
 */
export interface ExampleServices {
  /** Sends a message, keyed so a retried delivery is sent once. */
  deliver(
    to: string,
    subject: string,
    body: string,
    idempotencyKey: string,
  ): void;
  /** Pays an approved expense and returns the payment reference. */
  pay(payee: string, amountCents: number, idempotencyKey: string): string;
}

export function createExampleServices(log: {
  info(message: string, details: Record<string, unknown>): void;
}): ExampleServices {
  let sequence = 0;
  return {
    deliver: (to, subject, body, idempotencyKey) => {
      log.info('Delivered a lifecycle example message', {
        to,
        subject,
        body,
        idempotencyKey,
      });
    },
    pay: (payee, amountCents, idempotencyKey) => {
      sequence += 1;
      const reference = `PAY${new Date().toISOString().slice(0, 10).replaceAll('-', '')}${String(sequence).padStart(4, '0')}`;
      log.info('Paid a lifecycle example expense', {
        payee,
        amountCents,
        idempotencyKey,
        reference,
      });
      return reference;
    },
  };
}
