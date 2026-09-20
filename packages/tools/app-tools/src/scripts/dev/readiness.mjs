const DEFAULT_INTERVAL_MS = 100;
const DEFAULT_REQUEST_TIMEOUT_MS = 2_000;
const DEFAULT_START_TIMEOUT_MS = 120_000;

const delay = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const formatError = (error) =>
  error instanceof Error ? error.message : String(error);

export const waitForHttpReady = async ({
  intervalMs = DEFAULT_INTERVAL_MS,
  isReady = (response) => response.ok,
  label,
  requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
  timeoutMs = DEFAULT_START_TIMEOUT_MS,
  url,
}) => {
  const startedAt = Date.now();
  let lastFailure = 'the endpoint did not return a ready response';

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(requestTimeoutMs),
      });
      const body = await response.text();

      if (await isReady(response, body)) {
        return;
      }

      lastFailure = `HTTP ${response.status}`;
    } catch (error) {
      lastFailure = formatError(error);
    }

    const remainingMs = timeoutMs - (Date.now() - startedAt);
    if (remainingMs > 0) {
      await delay(Math.min(intervalMs, remainingMs));
    }
  }

  throw new Error(
    `${label} did not become ready at ${url} within ${timeoutMs}ms: ${lastFailure}`,
  );
};
