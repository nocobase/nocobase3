import { describe, expect, it } from 'vitest';

import {
  DeploymentPhaseError,
  DeploymentPhases,
} from '../src/deployment-phases.js';
import {
  AppCreateFailedError,
  AppReloadFailedError,
  fullErrorMessage,
  rootErrorMessage,
} from '../src/errors.js';

/**
 * These assertions are about one property: what an operator reads when a deployment fails.
 *
 * The Hub IPC channel serialises an error to its `message` and rebuilds it on the other side, so anything these
 * errors keep outside the message never reaches the console, the API, or a CI job waiting on a publish. Each case
 * below therefore checks the message itself rather than the fields behind it.
 */
describe('deployment failure context', () => {
  it('names the phase that failed', () => {
    const phases = new DeploymentPhases();
    const error = phases.failure(
      'extract',
      new Error('unexpected end of file'),
    );

    expect(error.message).toContain('extract');
    expect(error.message).toContain('unexpected end of file');
  });

  it('lists the phases that had already succeeded', () => {
    const phases = new DeploymentPhases();
    phases.complete('artifact download', 1200);
    phases.complete('extract', 3400);

    const error = phases.failure('discovery', new Error('no manifest'));

    expect(error.message).toContain('artifact download 1.2s');
    expect(error.message).toContain('extract 3.4s');
    expect(error.message).toContain('discovery');
  });

  it('says nothing about progress when the first phase fails', () => {
    const error = new DeploymentPhases().failure(
      'artifact download',
      new Error('connection reset'),
    );

    expect(error.message).toBe(
      'Deployment failed during artifact download: connection reset',
    );
  });

  it('reports sub-second phases in milliseconds', () => {
    const phases = new DeploymentPhases();
    phases.complete('artifact download', 340);

    expect(phases.failure('extract', new Error('boom')).message).toContain(
      'artifact download 340ms',
    );
  });

  it('keeps the original error reachable as a cause', () => {
    const cause = new Error('disk full');
    const error = new DeploymentPhases().failure('revision swap', cause);

    expect(error).toBeInstanceOf(DeploymentPhaseError);
    expect(error.cause).toBe(cause);
    expect(error.failedPhase).toBe('revision swap');
  });

  it('does not decorate an already decorated message twice', () => {
    const inner = new DeploymentPhases().failure(
      'extract',
      new Error('bad tar'),
    );
    const outer = new DeploymentPhases().failure('activation', inner);

    expect(outer.message).toBe(
      'Deployment failed during activation: Deployment failed during extract: bad tar',
    );
  });

  it('accepts a thrown value that is not an Error', () => {
    expect(
      new DeploymentPhases().failure('extract', 'plain string').message,
    ).toContain('plain string');
  });
});

describe('activation errors carry their cause', () => {
  it('states why the app failed to initialize', () => {
    const error = new AppCreateFailedError(
      'crm',
      new Error("Cannot find package 'hono'"),
    );

    // Before this, the message was only `App "crm" failed to initialize` and the reason was lost at the IPC hop.
    expect(error.message).toContain('crm');
    expect(error.message).toContain("Cannot find package 'hono'");
  });
});

describe('what a failed deployment reports', () => {
  it('keeps the context instead of digging out the innermost cause', () => {
    // What Hub stores in hub_app_deployments.error comes from the reconciler, which used to call
    // rootErrorMessage() and discard every wrapper. The reason survived; the context around it did not, so a
    // missing package was reported without saying whether it was missing during install or at startup.
    const real = new Error("Cannot find package 'hono'");
    const activation = new AppCreateFailedError('crm', real);

    expect(fullErrorMessage(activation)).toBe(
      `App "crm" failed to initialize: Cannot find package 'hono'`,
    );
    expect(rootErrorMessage(activation)).toBe("Cannot find package 'hono'");
  });

  it('keeps the phase context of an install failure', () => {
    const phases = new DeploymentPhases();
    phases.complete('artifact download', 1200);
    const failure = phases.failure(
      'extract',
      new Error('unexpected end of file'),
    );

    expect(fullErrorMessage(failure)).toBe(
      'Deployment failed during extract after artifact download 1.2s: unexpected end of file',
    );
  });
});

describe('naming the app once', () => {
  it('does not repeat the app name at every layer', () => {
    const failure = new AppReloadFailedError(
      'crm',
      new AppCreateFailedError('crm', new Error("Cannot find package 'hono'")),
    );

    expect(failure.message).toBe(
      `App "crm" failed to reload: failed to initialize: Cannot find package 'hono'`,
    );
  });

  it('keeps the name of a different app', () => {
    const failure = new AppReloadFailedError(
      'crm',
      new AppCreateFailedError('billing', new Error('boom')),
    );

    expect(failure.message).toBe(
      'App "crm" failed to reload: App "billing" failed to initialize: boom',
    );
  });
});
