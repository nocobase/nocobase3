import type { QueueConsumer } from './service.js';

export interface QueueHandlerRegistry extends QueueConsumer {
  size(): number;
  dispatch(
    channel: string,
    message: unknown,
    signal: AbortSignal,
  ): Promise<void>;
}

export function createQueueHandlerRegistry(): QueueHandlerRegistry {
  interface Registration {
    invoke(
      channel: string,
      message: unknown,
      signal: AbortSignal,
    ): Promise<void>;
    pending: Set<Promise<void>>;
  }
  const registrations = new Set<Registration>();
  return {
    size: (): number => registrations.size,
    consume<T>(
      handler: (
        channel: string,
        message: T,
        signal: AbortSignal,
      ) => Promise<void>,
    ) {
      const registration: Registration = {
        // T is the caller's declared JSON message contract; no runtime schema is supplied.
        invoke: (channel, message, signal) =>
          handler(channel, message as T, signal),
        pending: new Set(),
      };
      registrations.add(registration);
      return async (): Promise<void> => {
        registrations.delete(registration);
        await Promise.allSettled([...registration.pending]);
      };
    },
    async dispatch(channel, message, signal): Promise<void> {
      const snapshot = [...registrations];
      const pending = snapshot.map((registration) => {
        const invocation = Promise.resolve().then(() =>
          registration.invoke(channel, message, signal),
        );
        registration.pending.add(invocation);
        void invocation.then(
          () => registration.pending.delete(invocation),
          () => registration.pending.delete(invocation),
        );
        return invocation;
      });
      const settled = await Promise.allSettled(pending);
      const errors = settled.flatMap((result) =>
        result.status === 'rejected' ? [result.reason as unknown] : [],
      );
      if (errors.length)
        throw new AggregateError(errors, 'Queue handler execution failed');
    },
  };
}
