import cronstrue from 'cronstrue';
import 'cronstrue/locales/zh_CN.js';

function cronLocale(language: string): string {
  return language.toLowerCase().startsWith('zh') ? 'zh_CN' : 'en';
}

export function formatCronDescription(
  expression: string,
  language: string,
): string | undefined {
  try {
    return cronstrue.toString(expression, {
      locale: cronLocale(language),
      throwExceptionOnParseError: true,
    });
  } catch {
    return undefined;
  }
}
