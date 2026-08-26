import { get } from 'lodash';

function type(value: any): string {
  let valueType: string = typeof value;
  if (Array.isArray(value)) {
    valueType = 'array';
  } else if (value instanceof Date) {
    valueType = 'date';
  } else if (value === null) {
    valueType = 'null';
  }
  return valueType;
}

function Parameter(match: string) {
  let param: { key: string; defaultValue?: string };
  const matchValue = match.substr(2, match.length - 4).trim();
  const i = matchValue.indexOf(':');

  if (i !== -1) {
    param = {
      key: matchValue.substr(0, i),
      defaultValue: matchValue.substr(i + 1),
    };
  } else {
    param = { key: matchValue };
  }
  return param;
}

function Template<T extends (...args: any[]) => any>(
  fn: T,
  parameters: any[],
): T {
  (fn as any).parameters = Array.from(
    new Map(parameters.map((p) => [p.key, p])).values(),
  );
  return fn;
}

export function parse(value: any) {
  switch (type(value)) {
    case 'string':
      return parseString(value);
    case 'object':
      return parseObject(value);
    case 'array':
      return parseArray(value);
    default:
      return Template(function () {
        return value;
      }, [] as any[]);
  }
}

const parseString: any = (() => {
  const regex = /{{(\w|:|[\s-+.,@/()?=*_$])+}}/g;

  return (str: string) => {
    let parameters: { key: string; defaultValue?: string }[] = [];
    let templateFn = (context: any) => str;

    const matches = str.match(regex);
    if (matches) {
      parameters = matches.map(Parameter);
      templateFn = (context: any) => {
        context = context || {};
        return matches.reduce((result, match, i) => {
          const parameter = parameters[i];
          let value = get(context, parameter.key);

          if (typeof value === 'undefined') {
            value = parameter.defaultValue;
          }
          if (typeof value === 'function') {
            value = value();
          }
          if (
            matches.length === 1 &&
            str.startsWith('{{') &&
            str.endsWith('}}')
          ) {
            return value;
          }
          return result.replace(match, value);
        }, str);
      };
    }

    return Template(templateFn, parameters);
  };
})();

const parseObject = (() => {
  const getParameterRegex = (key: string) =>
    key.match(/\{\{(\w|:|[\s-+.,@/()?=*_$])+\}\}/g);

  return (obj: Record<string, any>) => {
    let parameters: any[] = [];
    const template = (context: any) => {
      const object: Record<string, any> = {};
      for (const key of Object.keys(obj)) {
        const keyParameters = getParameterRegex(key);
        if (keyParameters) {
          parameters = parameters.concat(keyParameters.map(Parameter));
        }
        let newKey = key;
        if (keyParameters) {
          newKey = Object.keys(parse(key)(context))[0];
        }
        object[newKey] = parse(obj[key])(context);
      }
      return object;
    };
    return Template(template, parameters);
  };
})();

const parseArray = (() => {
  return (array: any[]) => {
    let parameters: any[] = [];

    const template = (context: any) => {
      parameters = array
        .map((x) => parse(x).parameters)
        .reduce((acc, x) => acc.concat(x), []);
      return array.map((x) => parse(x)(context));
    };
    return Template(template, parameters);
  };
})();
