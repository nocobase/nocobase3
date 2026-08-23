export const SNOWFLAKE_EPOCH_SECONDS: number = 1_605_024_000;
export const SNOWFLAKE_MAX_WORKER_ID: number = 31;
export const SNOWFLAKE_MAX_SEQUENCE: number = 65_535;

const WORKER_COUNT = SNOWFLAKE_MAX_WORKER_ID + 1;
const SEQUENCE_COUNT = SNOWFLAKE_MAX_SEQUENCE + 1;

export interface IdGenerator<T> {
  generate(): T;
}

export interface SnowflakeIdGeneratorOptions {
  /** A unique worker ID in the range 0..31. */
  workerId: number;
  /** Epoch in seconds or milliseconds. Defaults to NocoBase's original epoch. */
  epoch?: number;
  /** Clock returning Unix time in milliseconds. */
  clock?: () => number;
}

export interface SnowflakeIdParts {
  id: number;
  /** Unix timestamp in seconds. */
  timestamp: number;
  workerId: number;
  sequence: number;
}

/**
 * Generates JavaScript-safe, time-ordered numeric IDs using NocoBase's
 * original 53-bit Snowflake layout: seconds + 5 worker bits + 16 sequence bits.
 */
export class SnowflakeIdGenerator implements IdGenerator<number> {
  readonly workerId: number;
  readonly epoch: number;

  private readonly clock: () => number;
  private lastTimestamp = -1;
  private sequence = 0;

  constructor(options: SnowflakeIdGeneratorOptions) {
    if (!options || !Number.isSafeInteger(options.workerId)) {
      throw new Error(
        'Snowflake workerId must be an integer between 0 and 31.',
      );
    }
    if (options.workerId < 0 || options.workerId > SNOWFLAKE_MAX_WORKER_ID) {
      throw new Error(
        `Snowflake workerId must be between 0 and ${SNOWFLAKE_MAX_WORKER_ID}.`,
      );
    }

    const epoch = options.epoch ?? SNOWFLAKE_EPOCH_SECONDS;
    if (!Number.isFinite(epoch) || epoch < 0) {
      throw new Error('Snowflake epoch must be a non-negative Unix timestamp.');
    }

    this.workerId = options.workerId;
    this.epoch = Math.floor(epoch > 1e12 ? epoch / 1_000 : epoch);
    this.clock = options.clock ?? Date.now;
  }

  generate(): number {
    const timestamp = this.timestamp();
    if (timestamp < this.lastTimestamp) {
      throw new Error(
        `Snowflake clock moved backwards by ${this.lastTimestamp - timestamp} second(s).`,
      );
    }

    if (timestamp === this.lastTimestamp) {
      if (this.sequence === SNOWFLAKE_MAX_SEQUENCE) {
        throw new Error('Snowflake sequence exhausted for the current second.');
      }
      this.sequence += 1;
    } else {
      this.sequence = 0;
    }

    const timestampOffset = timestamp - this.epoch;
    if (timestampOffset < 0) {
      throw new Error('Snowflake clock is earlier than the configured epoch.');
    }

    const id =
      timestampOffset * WORKER_COUNT * SEQUENCE_COUNT +
      this.workerId * SEQUENCE_COUNT +
      this.sequence;
    if (!Number.isSafeInteger(id)) {
      throw new Error(
        'Snowflake ID exceeds the JavaScript safe integer range.',
      );
    }

    this.lastTimestamp = timestamp;
    return id;
  }

  generateString(): string {
    return String(this.generate());
  }

  parse(id: number | string): SnowflakeIdParts {
    let numericId: number;
    if (typeof id === 'string') {
      if (id.trim() === '') {
        throw new Error(
          'Snowflake ID must be a non-negative JavaScript safe integer.',
        );
      }
      numericId = Number(id);
    } else {
      numericId = id;
    }
    if (!Number.isSafeInteger(numericId) || numericId < 0) {
      throw new Error(
        'Snowflake ID must be a non-negative JavaScript safe integer.',
      );
    }

    const sequence = numericId % SEQUENCE_COUNT;
    const workerId = Math.floor(numericId / SEQUENCE_COUNT) % WORKER_COUNT;
    const timestampOffset = Math.floor(
      numericId / (WORKER_COUNT * SEQUENCE_COUNT),
    );

    return {
      id: numericId,
      timestamp: timestampOffset + this.epoch,
      workerId,
      sequence,
    };
  }

  private timestamp(): number {
    const now = this.clock();
    if (!Number.isFinite(now) || now < 0) {
      throw new Error(
        'Snowflake clock must return a non-negative Unix timestamp in milliseconds.',
      );
    }
    return Math.floor(now / 1_000);
  }
}
