import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const script = new URL('../../scripts/smoke-create-app.sh', import.meta.url);

// Exercise the real shell lifecycle with HTTP servers and controlled pnpm outcomes, without downloading an app for
// every failure case. The CI action separately runs the same script with published packages and the real pnpm.
const fakePnpm = `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const command = process.argv[2];
const scenario = process.env.SMOKE_SCENARIO;
const state = process.env.SMOKE_STATE;
const basePath = process.env.SMOKE_BASE_PATH;
if (command === 'config') {
  console.log(process.env.PNPM_CONFIG_REGISTRY);
} else if (command === 'create') {
  fs.mkdirSync(path.join(process.argv[4], 'node_modules'), { recursive: true });
} else {
  if (process.cwd() !== path.join(state, 'crm')) throw new Error('Not in generated application');
  fs.appendFileSync(path.join(state, 'commands'), command + '\\n');
  if (command === 'build') {
    const devPid = Number(fs.readFileSync(path.join(state, 'dev.pid'), 'utf8'));
    let alive = false;
    try { process.kill(devPid, 0); alive = true; } catch {}
    if (alive) throw new Error('Dev is still running during build');
    if (scenario === 'build-fails') process.exit(9);
    fs.writeFileSync('built', 'yes');
  } else {
    if (command === 'start' && !fs.existsSync('built')) throw new Error('Start ran before build');
    if (scenario === command + '-exits') process.exit(7);
    const server = http.createServer((req, res) => {
      if (command === 'start' && req.url === basePath + '/api/healthz') {
        res.end(JSON.stringify({ ok: scenario !== 'unhealthy' }));
      } else if (req.url === basePath + '/') {
        res.statusCode = command === 'start' && scenario === 'homepage-fails' ? 500 : 200;
        res.end('<html>Generated app</html>');
      } else {
        res.statusCode = 404;
        res.end('Not found');
      }
    });
    server.listen(command === 'dev' ? 0 : Number(process.env.APP_SERVER_PORT), '127.0.0.1', () => {
      fs.writeFileSync(path.join(state, command + '.pid'), String(process.pid));
      if (command === 'dev') {
        console.log('App dev server ready');
        console.log('Local: http://127.0.0.1:' + server.address().port + basePath + '/');
      }
    });
  }
}
`;

async function runSmoke(t, scenario, basePath = '/main') {
  const workdir = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'smoke-script-test-')),
  );
  t.after(() => fs.rmSync(workdir, { recursive: true, force: true }));
  const bin = path.join(workdir, 'bin');
  fs.mkdirSync(bin);
  for (const tool of ['pnpm', 'npm']) {
    fs.writeFileSync(path.join(bin, tool), fakePnpm, { mode: 0o755 });
  }
  const child = spawn(
    'bash',
    [
      script.pathname,
      '--registry',
      'http://localhost:4873',
      '--create-app-version',
      '0.0.0-test',
      '--template',
      '@example/template@0.0.0-test',
      '--workdir',
      workdir,
      '--timeout',
      '3',
    ],
    {
      env: {
        ...process.env,
        PATH: `${bin}${path.delimiter}${process.env.PATH}`,
        SMOKE_SCENARIO: scenario,
        SMOKE_STATE: workdir,
        SMOKE_BASE_PATH: basePath,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 30_000,
    },
  );
  let output = '';
  child.stdout.on('data', (data) => (output += data));
  child.stderr.on('data', (data) => (output += data));
  const code = await new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', resolve);
  });
  for (const phase of ['dev', 'start']) {
    const pidFile = path.join(workdir, `${phase}.pid`);
    if (fs.existsSync(pidFile)) {
      const pid = Number(fs.readFileSync(pidFile, 'utf8'));
      assert.throws(
        () => process.kill(pid, 0),
        `${phase} process leaked: ${output}`,
      );
    }
  }
  return {
    code,
    output,
    commands: fs.existsSync(path.join(workdir, 'commands'))
      ? fs
          .readFileSync(path.join(workdir, 'commands'), 'utf8')
          .trim()
          .split('\n')
      : [],
  };
}

for (const basePath of ['', '/main', '/nested/app']) {
  test(`builds and starts the generated application at ${basePath || '/'}`, async (t) => {
    const result = await runSmoke(t, 'success', basePath);
    assert.equal(result.code, 0, result.output);
    assert.deepEqual(result.commands, ['dev', 'build', 'start']);
    assert.match(result.output, /passed dev, build, and start/u);
    assert.ok(result.output.includes(`${basePath}/api/healthz`));
  });
}

for (const [scenario, commands, error] of [
  ['dev-exits', ['dev'], 'pnpm dev exited'],
  ['build-fails', ['dev', 'build'], 'pnpm build failed'],
  ['start-exits', ['dev', 'build', 'start'], 'pnpm start exited'],
  ['unhealthy', ['dev', 'build', 'start'], 'pnpm start did not become ready'],
  ['homepage-fails', ['dev', 'build', 'start'], 'did not serve its homepage'],
]) {
  test(`fails and cleans up when ${scenario}`, async (t) => {
    const result = await runSmoke(t, scenario);
    assert.equal(result.code, 1, result.output);
    assert.deepEqual(result.commands, commands);
    assert.ok(result.output.includes(error), result.output);
  });
}
