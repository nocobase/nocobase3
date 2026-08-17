export interface DebouncedDraftSaver<T> {
  schedule(value: T): void;
  cancel(): void;
}

/** Collapse rapid edits into one write while always saving the latest snapshot. */
export function createDebouncedDraftSaver<T>(
  save: (value: T) => void | Promise<void>,
  delayMs = 1_500
): DebouncedDraftSaver<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  return {
    schedule(value) {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = undefined;
        void save(value);
      }, delayMs);
    },
    cancel() {
      if (timer) clearTimeout(timer);
      timer = undefined;
    },
  };
}
