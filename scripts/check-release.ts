/**
 * Pre-release checks, run by .github/workflows/release.yml and locally:
 *
 *   bun run release:check v0.2.0
 *
 * Fails (exit 1) when the tag doesn't match package.json, CHANGELOG.md has no entry for the
 * version, or package.json's repository.url doesn't match the GitHub repository. npm trusted
 * publishing rejects a mismatched repository.url, which happens after a repo rename.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const tag = process.argv[2] ?? process.env.GITHUB_REF_NAME ?? "";
const problems: string[] = [];

if (tag !== `v${pkg.version}`) {
  problems.push(`tag "${tag}" doesn't match package.json version (expected "v${pkg.version}")`);
}

const changelog = readFileSync(join(root, "CHANGELOG.md"), "utf8");
if (!changelog.includes(`## [${pkg.version}]`)) {
  problems.push(`CHANGELOG.md has no "## [${pkg.version}]" section`);
}

const repository = process.env.GITHUB_REPOSITORY;
if (repository) {
  const expected = `git+https://github.com/${repository}.git`;
  if (pkg.repository?.url !== expected) {
    problems.push(
      `package.json repository.url is "${pkg.repository?.url}", expected "${expected}"`,
    );
  }
}

if (problems.length > 0) {
  for (const p of problems) console.error(`✗ ${p}`);
  process.exit(1);
}
console.log(`✓ ready to release ${pkg.name}@${pkg.version}`);
