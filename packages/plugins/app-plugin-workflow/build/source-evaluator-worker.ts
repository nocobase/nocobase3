import path from 'node:path';
import { pathToFileURL } from 'node:url';

interface EvaluationSuccess {
  readonly ok: true;
  readonly json: string;
}

interface EvaluationFailure {
  readonly ok: false;
  readonly message: string;
}

function reply(message: EvaluationSuccess | EvaluationFailure): void {
  if (!process.send)
    throw new Error('Workflow evaluator requires an IPC channel');
  process.send(message);
}

function assertSerializableDefinition(
  value: unknown,
  location: string,
  ancestors: Set<object> = new Set<object>(),
): void {
  if (value === null || typeof value === 'boolean' || typeof value === 'string')
    return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value))
      throw new TypeError(`${location} contains a non-finite number`);
    return;
  }
  if (typeof value !== 'object')
    throw new TypeError(
      `${location} contains a non-JSON ${typeof value} value`,
    );
  if (ancestors.has(value))
    throw new TypeError(`${location} contains a circular reference`);
  if (
    !Array.isArray(value) &&
    Object.prototype.toString.call(value) !== '[object Object]'
  )
    throw new TypeError(`${location} contains a non-JSON object value`);
  if (Object.getOwnPropertySymbols(value).length)
    throw new TypeError(`${location} contains a symbol-keyed value`);
  ancestors.add(value);
  try {
    for (const [key, item] of Object.entries(value))
      assertSerializableDefinition(item, `${location}.${key}`, ancestors);
  } finally {
    ancestors.delete(value);
  }
}

const filePath = process.argv[2];
if (!filePath) {
  reply({ ok: false, message: 'Workflow definition path is required' });
} else {
  try {
    const loaded = (await import(
      pathToFileURL(path.resolve(filePath)).href
    )) as {
      default?: unknown;
    };
    assertSerializableDefinition(loaded.default, 'workflow');
    reply({ ok: true, json: JSON.stringify(loaded.default) });
  } catch (error) {
    reply({
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
