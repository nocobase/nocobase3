export type WorkflowInputScalar = string | number | boolean;

export type WorkflowInputOption = {
  label: string;
  value: string | number;
};

export type WorkflowInputDeclaration = {
  type: 'string' | 'number' | 'boolean';
  title?: string;
  description?: string;
  default?: WorkflowInputScalar;
  enum?: WorkflowInputOption[];
};

export type WorkflowInputSchema = Record<string, WorkflowInputDeclaration>;
export type WorkflowInputValues = Record<string, WorkflowInputScalar>;

const INPUT_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const FORBIDDEN_INPUT_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const DECLARATION_FIELDS = new Set(['type', 'title', 'description', 'default', 'enum']);
const OPTION_FIELDS = new Set(['label', 'value']);

export class WorkflowInputValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkflowInputValidationError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isScalarOfType(
  value: unknown,
  type: WorkflowInputDeclaration['type'],
): value is WorkflowInputScalar {
  return typeof value === type && (type !== 'number' || Number.isFinite(value));
}

function assertKnownFields(value: Record<string, unknown>, fields: Set<string>, location: string): void {
  for (const field of Object.keys(value)) {
    if (!fields.has(field)) {
      throw new WorkflowInputValidationError(`${location} contains unknown field "${field}"`);
    }
  }
}

export function normalizeWorkflowInputSchema(
  value: unknown,
  location: string = 'workflow.inputs',
): WorkflowInputSchema {
  if (value === undefined) {
    return {};
  }
  if (!isRecord(value)) {
    throw new WorkflowInputValidationError(`${location} must be an object`);
  }

  const result: WorkflowInputSchema = Object.create(null) as WorkflowInputSchema;
  for (const [key, rawDeclaration] of Object.entries(value)) {
    const declarationLocation = `${location}.${key}`;
    if (!INPUT_KEY_PATTERN.test(key) || FORBIDDEN_INPUT_KEYS.has(key)) {
      throw new WorkflowInputValidationError(`${declarationLocation} has an invalid input key`);
    }
    if (!isRecord(rawDeclaration)) {
      throw new WorkflowInputValidationError(`${declarationLocation} must be an object`);
    }
    assertKnownFields(rawDeclaration, DECLARATION_FIELDS, declarationLocation);
    if (!['string', 'number', 'boolean'].includes(String(rawDeclaration.type))) {
      throw new WorkflowInputValidationError(`${declarationLocation}.type must be string, number, or boolean`);
    }
    const type = rawDeclaration.type as WorkflowInputDeclaration['type'];
    if (Object.hasOwn(rawDeclaration, 'title') && typeof rawDeclaration.title !== 'string') {
      throw new WorkflowInputValidationError(`${declarationLocation}.title must be a string`);
    }
    if (Object.hasOwn(rawDeclaration, 'description') && typeof rawDeclaration.description !== 'string') {
      throw new WorkflowInputValidationError(`${declarationLocation}.description must be a string`);
    }
    if (Object.hasOwn(rawDeclaration, 'default') && !isScalarOfType(rawDeclaration.default, type)) {
      throw new WorkflowInputValidationError(`${declarationLocation}.default must be a ${type}`);
    }

    let inputEnum: WorkflowInputOption[] | undefined;
    if (Object.hasOwn(rawDeclaration, 'enum')) {
      if (type === 'boolean') {
        throw new WorkflowInputValidationError(`${declarationLocation}.enum is not supported for boolean inputs`);
      }
      if (!Array.isArray(rawDeclaration.enum)) {
        throw new WorkflowInputValidationError(`${declarationLocation}.enum must be an array`);
      }
      const seen = new Set<string | number>();
      inputEnum = rawDeclaration.enum.map((rawOption, index) => {
        const optionLocation = `${declarationLocation}.enum[${index}]`;
        if (!isRecord(rawOption)) {
          throw new WorkflowInputValidationError(`${optionLocation} must be an object`);
        }
        assertKnownFields(rawOption, OPTION_FIELDS, optionLocation);
        if (typeof rawOption.label !== 'string') {
          throw new WorkflowInputValidationError(`${optionLocation}.label must be a string`);
        }
        if (!isScalarOfType(rawOption.value, type)) {
          throw new WorkflowInputValidationError(`${optionLocation}.value must be a ${type}`);
        }
        const optionValue = rawOption.value as string | number;
        if (seen.has(optionValue)) {
          throw new WorkflowInputValidationError(`${declarationLocation}.enum contains duplicate value ${optionValue}`);
        }
        seen.add(optionValue);
        return { label: rawOption.label, value: optionValue };
      });
      if (Object.hasOwn(rawDeclaration, 'default') && !seen.has(rawDeclaration.default as string | number)) {
        throw new WorkflowInputValidationError(`${declarationLocation}.default must be one of the enum values`);
      }
    }

    result[key] = {
      type,
      ...(rawDeclaration.title === undefined ? {} : { title: rawDeclaration.title as string }),
      ...(rawDeclaration.description === undefined
        ? {}
        : { description: rawDeclaration.description as string }),
      ...(Object.hasOwn(rawDeclaration, 'default')
        ? { default: rawDeclaration.default as WorkflowInputScalar }
        : {}),
      ...(inputEnum === undefined ? {} : { enum: inputEnum }),
    };
  }
  return result;
}

export function normalizeWorkflowInputValues(
  schema: WorkflowInputSchema | null | undefined,
  value: unknown,
  location: string = 'inputValues',
): WorkflowInputValues {
  if (!isRecord(value)) {
    throw new WorkflowInputValidationError(`${location} must be an object`);
  }
  const declarations = schema ?? {};
  const result: WorkflowInputValues = Object.create(null) as WorkflowInputValues;
  for (const [key, inputValue] of Object.entries(value)) {
    if (!Object.hasOwn(declarations, key)) {
      throw new WorkflowInputValidationError(`${location}.${key} is not declared`);
    }
    const declaration = declarations[key];
    if (!isScalarOfType(inputValue, declaration.type)) {
      throw new WorkflowInputValidationError(`${location}.${key} must be a ${declaration.type}`);
    }
    if (declaration.enum && !declaration.enum.some((option) => Object.is(option.value, inputValue))) {
      throw new WorkflowInputValidationError(`${location}.${key} must be one of the declared enum values`);
    }
    result[key] = inputValue;
  }
  return result;
}

export function retainCompatibleWorkflowInputValues(
  schema: WorkflowInputSchema,
  value: unknown,
): WorkflowInputValues {
  if (!isRecord(value)) {
    return {};
  }
  const result: WorkflowInputValues = Object.create(null) as WorkflowInputValues;
  for (const [key, inputValue] of Object.entries(value)) {
    const declaration = schema[key];
    if (!declaration || !isScalarOfType(inputValue, declaration.type)) {
      continue;
    }
    if (declaration.enum && !declaration.enum.some((option) => Object.is(option.value, inputValue))) {
      continue;
    }
    result[key] = inputValue;
  }
  return result;
}

export function resolveWorkflowInput(
  schema: WorkflowInputSchema | null | undefined,
  values: WorkflowInputValues | null | undefined,
): WorkflowInputValues {
  const result: WorkflowInputValues = Object.create(null) as WorkflowInputValues;
  for (const [key, declaration] of Object.entries(schema ?? {})) {
    if (Object.hasOwn(values ?? {}, key)) {
      result[key] = (values as WorkflowInputValues)[key];
    } else if (Object.hasOwn(declaration, 'default')) {
      result[key] = declaration.default as WorkflowInputScalar;
    }
  }
  return result;
}
