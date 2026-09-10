import { describe, expect, it } from 'vitest';
import { fileProvider } from '../src/providers/file.js';
import { Config } from '../src/index.js';
import { tomlParser } from '../src/parsers/toml.js';
import { objectProvider } from '../src/providers/object.js';

describe('TOML configuration', () => {
  it('loads an absent optional TOML file as an empty config', async () => {
    const config = new Config();
    await config.load(
      fileProvider('/missing/config.toml', { optional: true }),
      tomlParser(),
    );
    expect(config.raw()).toEqual({});
  });
  it('round trips nested tables, arrays and credentials', () => {
    const parser = tomlParser();
    const value = {
      auth: { secret: 'quotes " and \\ and # symbols' },
      database: {
        connections: { main: { port: 5432, ssl: false, schema: ['public'] } },
      },
    };
    expect(parser.parse(parser.serialize(value))).toEqual(value);
  });
  it('merges deployment values without losing code callbacks', async () => {
    const config = new Config();
    const sendResetPassword = async () => undefined;
    await config.load(
      objectProvider({
        auth: { emailAndPassword: { enabled: true, sendResetPassword } },
      }),
    );
    await config.load(
      objectProvider(
        tomlParser().parse(
          new TextEncoder().encode(
            '[auth]\nsecret = "deployment-secret"\n[auth.emailAndPassword]\nenabled = false\n',
          ),
        ),
      ),
    );
    expect(config.get('auth.emailAndPassword.sendResetPassword')).toBe(
      sendResetPassword,
    );
    expect(config.get('auth.emailAndPassword.enabled')).toBe(false);
    expect(config.get('auth.secret')).toBe('deployment-secret');
  });
});
