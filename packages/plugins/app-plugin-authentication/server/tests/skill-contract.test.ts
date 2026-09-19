import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const skillRoot = path.join(
  packageRoot,
  'skills/nocobase-app-plugin-authentication',
);

describe('@nocobase/app-plugin-authentication Agent Skill contract', () => {
  it('publishes the package-owned authentication Skill', () => {
    const packageJson = JSON.parse(
      readFileSync(path.join(packageRoot, 'package.json'), 'utf8'),
    ) as { readonly files: readonly string[] };
    const skill = readFileSync(path.join(skillRoot, 'SKILL.md'), 'utf8');

    expect(packageJson.files).toContain('skills');
    expect(skill).toContain('name: nocobase-app-plugin-authentication');
    expect(skill).not.toMatch(/development draft|placeholder|TODO/iu);

    for (const surface of [
      'authenticationToken',
      'userAdministrationServiceToken',
      'authenticationClientToken',
      'useAuthentication',
      'RequiredAuthentication',
      'GuestAuthentication',
      'usePasswordLogin',
      'usePasswordRegistration',
      'usePasswordResetRequest',
      'usePasswordReset',
      '/api/auth/*',
    ]) {
      expect(skill).toContain(surface);
    }

    expect(skill).toMatch(/401/u);
    expect(skill).toMatch(/403/u);
    expect(skill).toContain('ACCOUNT_DISABLED');
    expect(skill).toContain('issuer + subject');
  });

  it('references only reference files that exist', () => {
    const skill = readFileSync(path.join(skillRoot, 'SKILL.md'), 'utf8');
    const references = [
      'protecting-routes.md',
      'client-session-and-pages.md',
      'adding-sign-in-methods.md',
      'custom-better-auth-plugin.md',
      'user-lifecycle-and-deployment.md',
    ];

    for (const reference of references) {
      expect(skill).toContain(`references/${reference}`);
      expect(existsSync(path.join(skillRoot, 'references', reference))).toBe(
        true,
      );
    }

    const linked = [...skill.matchAll(/references\/([\w-]+\.md)/gu)].map(
      (match) => match[1],
    );
    expect(new Set(linked)).toEqual(new Set(references));
  });
});
