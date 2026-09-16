import type {
  AuthorizationOptions,
  LocalizedText,
  ResourceGroupOption,
  SelectOption,
} from '../authorization-client.js';
import type { Translate } from '../i18n.js';

export function localizeOptions(
  raw: AuthorizationOptions<LocalizedText>,
  t: Translate,
): AuthorizationOptions {
  const text = (value: LocalizedText): string =>
    typeof value === 'string'
      ? value
      : t(value.key, {
          ns: value.ns,
          defaultValue: value.defaultValue ?? value.key,
        });
  const option = <T extends SelectOption<LocalizedText>>(value: T) => {
    const { label, description, ...rest } = value;
    return {
      ...rest,
      label: text(label),
      ...(description === undefined ? {} : { description: text(description) }),
    };
  };
  const groups = (
    values: readonly ResourceGroupOption<LocalizedText>[],
  ): ResourceGroupOption[] =>
    values.map((value) => ({
      ...option(value),
      children: value.children && groups(value.children),
    }));
  return {
    ...raw,
    resourceTypes: raw.resourceTypes.map((type) => ({
      ...option(type),
      groups: type.groups && groups(type.groups),
      actions: type.actions.map(option),
      resources: type.resources.map((resource) => ({
        ...option(resource),
        actions: resource.actions?.map(option),
      })),
    })),
    subjectTypes: raw.subjectTypes.map(option),
    recordAccessPolicies: raw.recordAccessPolicies.map(option),
  };
}
