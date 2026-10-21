# Releasing create-bun-api

Releases go out through **npm trusted publishing** (GitHub OIDC; no npm token stored anywhere) and
**staged publishing**. CI uploads a release, and it only goes public after a maintainer approves it
with 2FA. npm can't attach a trusted publisher to a package that doesn't exist yet, so the very
first version is published by hand once.

## One-time setup (the package owner does this)

### 1. npm account

- Sign in at https://www.npmjs.com (or create an account) and turn on two-factor authentication
  (**Account → Two-Factor Authentication**). Publishing, trust settings, and approvals all require it.

### 2. Publish 0.1.0 by hand

Run this from a clean checkout of `master`:

```bash
git checkout master && git pull
bun install --frozen-lockfile
bun run ci                                   # every check; must pass
bun pm pack                                  # writes create-bun-api-0.1.0.tgz (the tested artifact)
npm login                                    # browser sign-in
npm publish ./create-bun-api-0.1.0.tgz       # asks for your 2FA code
```

Then confirm it works from the registry, in an empty directory:

```bash
bunx create-bun-api describe | head -5
bun create bun-api demo --yes && cd demo && bun run verify
```

Tag the release. The release workflow sees that 0.1.0 is already on npm and does nothing:

```bash
git tag v0.1.0 && git push origin v0.1.0
```

### 3. Connect GitHub Actions as the trusted publisher

Do this when you're ready to cut the next release. npm expires a trusted publisher configuration
that hasn't completed a publish within 2 days.

On https://www.npmjs.com/package/create-bun-api, open **Settings → Trusted Publisher**, choose
**GitHub Actions**, and enter:

| Field | Value |
| --- | --- |
| Organization or user | `KevinArce` |
| Repository | `bun-cli` |
| Workflow filename | `release.yml` |
| Environment name | `npm` |
| Allowed actions | Leave the default (`npm stage publish`). Don't allow `npm publish`. |

With only staged publishing allowed, a compromised workflow can upload a release but can't make it
public without your 2FA approval.

`npm trust list create-bun-api` (npm 11.15 or newer) shows the saved configuration.

> **Renaming the GitHub repository?** Do it before this step, then update `homepage`,
> `repository.url`, and the CHANGELOG links in the repo. npm requires `repository.url` to match
> the repository exactly, and `bun run release:check` fails in CI when they differ.

### 4. Lock down token publishing

After the first release through CI has gone live:

- **Settings → Publishing access → "Require two-factor authentication and disallow tokens"**.
  Trusted publishing keeps working because it doesn't use tokens.
- Revoke any npm access tokens you no longer need (**Account → Access Tokens**).

Optional extra gate: on GitHub, open **Settings → Environments → npm** and add yourself as a required
reviewer. The workflow then waits for your approval before it even runs.

## Every release after that

1. Bump `version` in `package.json`. If the template changed, bump `templates/api/package.json` too.
2. Move the `[Unreleased]` notes in `CHANGELOG.md` under a new `## [x.y.z] - YYYY-MM-DD` heading and
   update the compare links at the bottom.
3. Check: `bun run release:check vx.y.z && bun run ci`.
4. Commit, tag, and push:

   ```bash
   git commit -am "chore: release vx.y.z"
   git tag vx.y.z
   git push origin master vx.y.z
   ```

5. The `release` workflow runs every check, packs, and stages the tarball. Approve it on
   npmjs.com (**create-bun-api → Staged Packages → Approve**, with 2FA), or from a terminal with
   `npm stage list create-bun-api` and then `npm stage approve <stage-id>`.
6. Confirm: `bunx create-bun-api@x.y.z describe`.

## If something goes wrong

| Symptom | Cause and fix |
| --- | --- |
| `check-release` fails: tag doesn't match | The tag isn't `v` + `package.json` version. Delete the tag (`git push --delete origin vx.y.z`), fix, and re-tag. |
| `check-release` fails: `repository.url` | The repo was renamed or moved. Update `package.json`, then the trusted publisher settings. |
| Publish fails with 401, 403, or an OIDC error | The trusted publisher fields don't match the workflow (filename `release.yml`, environment `npm`, repository), or the configuration expired after 2 unused days. Recreate it. |
| A bad version went out | `npm deprecate create-bun-api@x.y.z "reason"` and release a fix. Unpublishing is limited and breaks users, so avoid it. |
