export class ConfigError extends Error {
  override readonly name: string = 'ConfigError';
}

export class ConfigPathError extends ConfigError {
  override readonly name: string = 'ConfigPathError';

  constructor(
    readonly path: string,
    message: string,
  ) {
    super(`Invalid configuration path "${path}": ${message}`);
  }
}

export class ConfigTypeError extends ConfigError {
  override readonly name: string = 'ConfigTypeError';

  constructor(
    readonly path: string,
    readonly expected: string,
    readonly actual: string,
  ) {
    super(
      `Invalid configuration at "${path}": expected ${expected}, received ${actual}.`,
    );
  }
}

export class ConfigMergeError extends ConfigError {
  override readonly name: string = 'ConfigMergeError';

  constructor(
    readonly path: string,
    readonly previousType: string,
    readonly nextType: string,
  ) {
    super(
      `Cannot merge configuration at "${path}": ${previousType} cannot be replaced by ${nextType} in strict mode.`,
    );
  }
}

export class ConfigProviderError extends ConfigError {
  override readonly name: string = 'ConfigProviderError';

  constructor(
    readonly provider: string,
    message: string,
    options?: ErrorOptions,
  ) {
    super(`Configuration provider "${provider}" failed: ${message}`, options);
  }
}

export class ConfigParserError extends ConfigError {
  override readonly name: string = 'ConfigParserError';

  constructor(
    readonly parser: string,
    readonly provider: string,
    message: string,
    options?: ErrorOptions,
  ) {
    super(
      `Configuration parser "${parser}" failed for provider "${provider}": ${message}`,
      options,
    );
  }
}
