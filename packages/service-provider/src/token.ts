const serviceTokenType: unique symbol = Symbol('service-token-type');

export interface ServiceToken<T> {
  readonly name: string;
  readonly [serviceTokenType]?: T;
}

export function createServiceToken<T>(name: string): ServiceToken<T> {
  if (!name.trim()) {
    throw new Error('Service token name must not be empty.');
  }

  return Object.freeze({ name });
}
