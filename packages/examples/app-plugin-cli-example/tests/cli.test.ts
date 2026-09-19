import { describe, expect, it } from 'vitest';

import cliPlugin from '../cli/index.ts';
import CliExampleArtifactBuild from '../cli/artifact-build.ts';
import CliExampleGreet from '../cli/greet.ts';
import packageMetadata from '../package.json' with { type: 'json' };

describe('cli plugin definition', () => {
  it('declares the package it belongs to', () => {
    expect(cliPlugin.packageName).toBe(packageMetadata.name);
  });

  it('claims a topic and describes it', () => {
    expect(cliPlugin.topic).toBe('demo');
    expect(cliPlugin.description).toBeTruthy();
  });

  it('maps sub-command names to their command classes', () => {
    expect(cliPlugin.commands).toEqual({
      greet: CliExampleGreet,
      'artifact:build': CliExampleArtifactBuild,
    });
  });

  it('exposes the cli entry the app imports', () => {
    expect(packageMetadata.exports['./cli']).toBeDefined();
    expect(packageMetadata.publishConfig.exports['./cli']).toBeDefined();
  });

  it('declares oclif as a peer so the app provides one copy', () => {
    expect(packageMetadata.peerDependencies['@oclif/core']).toBeTruthy();
    // Declared once. pnpm resolves the peer here on its own, so a duplicate devDependency would add nothing.
    expect(packageMetadata.devDependencies?.['@oclif/core']).toBeUndefined();
  });
});

describe('contributed commands', () => {
  const commands = Object.entries(cliPlugin.commands);

  it('gives every command a summary and an example', () => {
    for (const [name, command] of commands) {
      expect(command.summary, `${name} has no summary`).toBeTruthy();
      expect(
        command.examples?.length,
        `${name} has no example`,
      ).toBeGreaterThan(0);
    }
  });

  it('describes every flag and argument', () => {
    for (const [name, command] of commands) {
      for (const [flag, definition] of Object.entries(command.flags ?? {})) {
        expect(
          definition.description ?? definition.summary,
          `${name} --${flag} has no description`,
        ).toBeTruthy();
      }
      for (const [argument, definition] of Object.entries(command.args ?? {})) {
        expect(
          definition.description,
          `${name} ${argument} has no description`,
        ).toBeTruthy();
      }
    }
  });
});
