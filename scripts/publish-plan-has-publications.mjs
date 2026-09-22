import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

export function countPublications(document) {
  if (!document || document.version !== 1 || !Array.isArray(document.plan)) {
    throw new Error(
      'Publish plan must be a version 1 document with a plan array.',
    );
  }
  let count = 0;
  for (const [groupIndex, group] of document.plan.entries()) {
    if (!Array.isArray(group)) {
      throw new Error(`Publish plan group ${groupIndex} must be an array.`);
    }
    for (const entry of group) {
      if (!entry || !['publish', 'tag-only'].includes(entry.kind)) {
        throw new Error(
          `Publish plan group ${groupIndex} contains an invalid entry.`,
        );
      }
      if (entry.kind === 'publish') count += 1;
    }
  }
  return count;
}

function main(filePath) {
  if (!filePath)
    throw new Error(
      'Usage: publish-plan-has-publications.mjs <publish-plan.json>',
    );
  const document = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const count = countPublications(document);
  console.log(
    `${count} package publication${count === 1 ? '' : 's'} in ${filePath}`,
  );
  process.exitCode = count > 0 ? 0 : 1;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main(process.argv[2]);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 2;
  }
}
