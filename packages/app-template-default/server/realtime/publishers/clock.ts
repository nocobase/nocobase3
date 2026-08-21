import type { RealtimeService } from '../service.js';

export const CLOCK_TOPIC: string = 'clock:now';

export interface ClockPublisherOptions {
  intervalMs?: number;
}

export function startClockPublisher(
  realtime: RealtimeService,
  options: ClockPublisherOptions = {},
): () => void {
  const intervalMs = options.intervalMs ?? 200;
  let interval: NodeJS.Timeout | undefined;

  const start = (): void => {
    if (interval) {
      return;
    }

    interval = setInterval(() => {
      realtime.publish(CLOCK_TOPIC, new Date().toString());
    }, intervalMs);
    interval.unref();
  };

  const stop = (): void => {
    if (!interval) {
      return;
    }

    clearInterval(interval);
    interval = undefined;
  };

  const unsubscribe = realtime.onTopicSubscriptionChange(
    CLOCK_TOPIC,
    (count) => {
      if (count > 0) {
        start();
        return;
      }

      stop();
    },
  );

  if (realtime.subscriptionCount(CLOCK_TOPIC) > 0) {
    start();
  }

  return () => {
    unsubscribe();
    stop();
  };
}
