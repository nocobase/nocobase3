import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import { createApp } from '../../server/app.js';

const EMPLOYEES_DIR = path.resolve(process.cwd(), 'ai', 'employees');
const DIST_EMPLOYEES_DIR = path.resolve(
  process.cwd(),
  'dist',
  'ai',
  'employees',
);
const BUILTIN_EMPLOYEES = [
  'atlas',
  'dex',
  'ellis',
  'form_assistant',
  'lexi',
  'vera',
  'viz',
];

describe('built-in and application AI employees', () => {
  it('keeps an application-owned employee fixture under the app resource tree', () => {
    expect(
      fs.existsSync(
        path.join(EMPLOYEES_DIR, 'application-validation', 'index.ts'),
      ),
    ).toBe(true);
  });

  it('loads package builtins before application resources when compiled dist/ai exists', async () => {
    if (!fs.existsSync(DIST_EMPLOYEES_DIR)) return;

    const app = createApp({
      basePath: '/app-template-default',
      aiDirectory: path.resolve(process.cwd(), 'dist', 'ai'),
      nocoBaseApiUrl: false,
    });
    const response = await app.request(
      'http://localhost/app-template-default/api/ai/aiEmployees:listByUser',
      {
        method: 'GET',
        headers: {
          'content-type': 'application/json',
          'x-user-id': 'root-user',
          'x-roles': 'root',
        },
      },
    );
    const employees = (await response.json()) as Array<Record<string, any>>;
    const found = new Set(employees.map((employee) => employee.username));

    for (const username of BUILTIN_EMPLOYEES) {
      expect(
        found.has(username),
        `built-in employee ${username} must register`,
      ).toBe(true);
    }
    for (const username of ['dara', 'lina', 'nathan', 'orin']) {
      expect(
        found.has(username),
        `removed built-in employee ${username} must not register`,
      ).toBe(false);
    }
    expect(found.has('application-validation')).toBe(true);
    expect(
      employees.find(
        (employee) => employee.username === 'application-validation',
      ),
    ).toMatchObject({
      category: 'developer',
      builtIn: true,
    });
  });
});
