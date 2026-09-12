import { describe, expect, it } from 'vitest';
import {
  SNOWFLAKE_EPOCH_SECONDS,
  SNOWFLAKE_MAX_SEQUENCE,
  SnowflakeIdGenerator,
} from '../src/index.js';

describe('SnowflakeIdGenerator', () => {
  it('generates and parses IDs compatible with the original NocoBase layout', () => {
    const timestamp = SNOWFLAKE_EPOCH_SECONDS + 100;
    const generator = new SnowflakeIdGenerator({
      workerId: 7,
      clock: () => timestamp * 1_000,
    });

    const first = generator.generate();
    const second = generator.generate();

    expect(Number.isSafeInteger(first)).toBe(true);
    expect(second).toBe(first + 1);
    expect(generator.parse(first)).toEqual({
      id: first,
      timestamp,
      workerId: 7,
      sequence: 0,
    });
    expect(generator.parse(second).sequence).toBe(1);
  });

  it('generates decimal strings for string ID consumers', () => {
    const generator = new SnowflakeIdGenerator({ workerId: 1 });
    const id = generator.generateString();

    expect(id).toMatch(/^\d+$/);
    expect(generator.parse(id).workerId).toBe(1);
  });

  it('keeps IDs unique across workers', () => {
    const now = (SNOWFLAKE_EPOCH_SECONDS + 200) * 1_000;
    const first = new SnowflakeIdGenerator({ workerId: 1, clock: () => now });
    const second = new SnowflakeIdGenerator({ workerId: 2, clock: () => now });

    expect(first.generate()).not.toBe(second.generate());
  });

  it('accepts an epoch in milliseconds', () => {
    const epoch = SNOWFLAKE_EPOCH_SECONDS * 1_000;
    const generator = new SnowflakeIdGenerator({
      workerId: 0,
      epoch,
      clock: () => epoch + 10_000,
    });

    expect(generator.parse(generator.generate()).timestamp).toBe(
      SNOWFLAKE_EPOCH_SECONDS + 10,
    );
  });

  it('rejects invalid worker IDs', () => {
    expect(() => new SnowflakeIdGenerator({ workerId: -1 })).toThrow(
      'between 0 and 31',
    );
    expect(() => new SnowflakeIdGenerator({ workerId: 32 })).toThrow(
      'between 0 and 31',
    );
    expect(() => new SnowflakeIdGenerator({ workerId: 1.5 })).toThrow(
      'integer',
    );
  });

  it('fails when the clock moves backwards', () => {
    let now = (SNOWFLAKE_EPOCH_SECONDS + 20) * 1_000;
    const generator = new SnowflakeIdGenerator({
      workerId: 0,
      clock: () => now,
    });
    generator.generate();
    now -= 1_000;

    expect(() => generator.generate()).toThrow('clock moved backwards');
  });

  it('fails instead of blocking when the sequence is exhausted', () => {
    const now = (SNOWFLAKE_EPOCH_SECONDS + 20) * 1_000;
    const generator = new SnowflakeIdGenerator({
      workerId: 0,
      clock: () => now,
    });

    for (let sequence = 0; sequence <= SNOWFLAKE_MAX_SEQUENCE; sequence += 1) {
      generator.generate();
    }

    expect(() => generator.generate()).toThrow('sequence exhausted');
  });

  it('continues in timestamp order when the clock advances', () => {
    let now = (SNOWFLAKE_EPOCH_SECONDS + 20) * 1_000;
    const generator = new SnowflakeIdGenerator({
      workerId: 0,
      clock: () => now,
    });
    const first = generator.generate();
    now += 1_000;
    const second = generator.generate();

    expect(second).toBeGreaterThan(first);
    expect(generator.parse(second).sequence).toBe(0);
  });

  it('rejects invalid IDs', () => {
    const generator = new SnowflakeIdGenerator({ workerId: 0 });

    expect(() => generator.parse('')).toThrow('safe integer');
    expect(() => generator.parse('-1')).toThrow('safe integer');
    expect(() => generator.parse(Number.MAX_SAFE_INTEGER + 1)).toThrow(
      'safe integer',
    );
  });
});
