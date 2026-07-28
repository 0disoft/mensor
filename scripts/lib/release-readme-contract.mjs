export function validateReleaseReadme({ readme, version }) {
  const failures = [];
  const status = readSection(readme, "Status");
  const installation = readSection(readme, "Registry Installation");

  if (status === undefined) {
    failures.push("README.md must contain a Status section.");
  } else if (!status.includes(`Version \`${version}\` is the current public preview.`)) {
    failures.push(`README.md Status must identify ${version} as the current public preview.`);
  }

  const installCommand = `pnpm add --save-dev @0disoft/mensor-cli@${version}`;
  if (installation === undefined) {
    failures.push("README.md must contain a Registry Installation section.");
  } else if (!installation.includes(installCommand)) {
    failures.push(`README.md Registry Installation must contain ${JSON.stringify(installCommand)}.`);
  }

  const migrationPath = `docs/releasing/${version}.md`;
  if (installation !== undefined && !installation.includes(migrationPath)) {
    failures.push(`README.md Registry Installation must link to ${migrationPath}.`);
  }

  return failures;
}

function readSection(markdown, heading) {
  const marker = `## ${heading}`;
  const start = markdown.indexOf(marker);
  if (start === -1) {
    return undefined;
  }

  const contentStart = start + marker.length;
  const nextHeading = markdown.indexOf("\n## ", contentStart);
  return markdown.slice(contentStart, nextHeading === -1 ? undefined : nextHeading);
}
