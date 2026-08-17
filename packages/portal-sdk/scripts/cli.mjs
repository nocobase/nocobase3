#!/usr/bin/env node

import { checkTemplateCompatibility } from "./check-template-compatibility.mjs";

const command = process.argv[2] ?? "check";

if (command !== "check") {
  process.stderr.write("Usage: portal-sdk check\n");
  process.exitCode = 1;
} else {
  try {
    checkTemplateCompatibility();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
    process.exitCode = 1;
  }
}
