# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`eerawlog` is a small Node CLI that pretty-prints [EmailEngine](https://emailengine.app/) logs. EmailEngine emits NDJSON Pino logs, and when run with `EENGINE_LOG_RAW=true` it also includes base64-encoded raw IMAP socket traffic. This tool reads those log lines from stdin and renders selected entry types in a human-readable, color-coded form.

Typical invocation: `EENGINE_LOG_RAW=true emailengine | eerawlog [--filter.<key>=<value> ...]`

There is no build step. Source is plain CommonJS; `bin/eerawlog.js` is a one-line shim that `require`s `index.js`.

## Commands

- `npm test` - runs `test/cli.test.js` via `node --test`. These are **black-box CLI tests**: each case spawns `bin/eerawlog.js` as a subprocess, pipes NDJSON to its stdin, strips ANSI with `clc.strip`, and asserts on stdout. There are no unit tests of internal functions - behavior is pinned only through the CLI surface, so a change to rendering must be validated by feeding representative log lines.
- Run one test by name: `node --test --test-name-pattern="filter.account back-fill" test/cli.test.js`.
- `npm run lint` / `npm run lint:fix` - ESLint 10 flat config in `eslint.config.js` (the shared Postal Systems baseline, eslint-config-prettier last). Keep it identical to the other repos except the "Repo-specific" block.
- `npm run format` / `npm run format:check` - Prettier 3 with `.prettierrc.js` (4-space, single quotes, 160 col, no trailing commas, `arrowParens: 'avoid'`); `.prettierignore` skips the lockfile and `CHANGELOG.md`.
- `npm run test:coverage` - the test suite under `c8`. The CLI tests spawn `bin/eerawlog.js` as subprocesses; c8 still covers `index.js` because `NODE_V8_COVERAGE` is inherited by the children.
- `npm run test:cjs` - the suite with `require(esm)` disabled (see Platform constraints).
- CI (`.github/workflows/test.yaml`) runs `npm ci`, lint, format check and tests on Node 20, 22 and 24, plus `npm run test:cjs` on Node 22 and 24. `engines.node` is `>=20.0.0`.
- `npm run update` - wipes `node_modules`/`package-lock.json`, runs `ncu -u`, reinstalls. See Platform constraints below before accepting any bump.

## Platform constraints

eerawlog sits in the EmailEngine dependency tree, and EmailEngine ships as a `@yao-pkg/pkg` binary that snapshots a CommonJS module graph and cannot load ES modules. Its DigitalOcean one-click images update EmailEngine but never the Node.js under it. Two rules follow:

- **Node.js 20 is the minimum.** Code, tests and tooling must work on Node 20, 22 and 24 (`engines.node` is `>=20.0.0`).
- **Everything that reaches runtime must be genuinely CommonJS-loadable.** The package and every dependency, direct and transitive, must ship real CommonJS: `require()` has to work with `--no-experimental-require-module`, and a CommonJS entry that only wraps a dynamic `import()` of ESM code does not count. Node 22+ (and 20.19) enable `require(esm)` by default, so an ESM-only dependency loads transparently in a plain `npm test` and hides the problem.

How to check:

- `npm run test:cjs` runs the suite with `NODE_OPTIONS=--no-experimental-require-module` (inherited by the spawned CLI processes), so an ESM-only dependency fails there. CI runs it on Node 22 and 24. Run it after `npm run update` or any dependency bump.
- Also inspect the metadata: no runtime dependency's `package.json` may declare `"type": "module"` unless it also exposes a genuine CommonJS entry via an `exports` `require` condition. The devDependencies (eslint, prettier, c8) include ESM packages and never reach runtime, so scan only the production tree (expect no output): `for d in $(npm ls --omit=dev --all --parseable | tail -n +2); do grep -l '"type": *"module"' $d/package.json; done`.
- Never add or upgrade to an ESM-only dependency. If a new major has gone ESM-only, pin the last CommonJS major in `.ncurc.js` (`reject` or `target`) with a comment giving the reason, instead of upgrading.

## Architecture

Almost everything lives in `index.js` (~210 lines). The pipeline is:

```
process.stdin -> split2(Parse) -> Logger (Writable, objectMode) -> process.stdout
```

- `Parse(data)` is a per-line factory invoked by `split2`. It returns an object with either `{value: <parsedJSON>}` on success or `{err, input}` on failure (so malformed lines are still printed in yellow rather than crashing).
- `Logger._write` is a chain of independent `if` blocks, one per recognized log shape. A single chunk may match multiple blocks (e.g. a connection event also containing TLS info). The recognized shapes are:
    - `action === 'onPreHandler'` with `path` starting `/v1/` - Hapi route handler entry.
    - `component === 'api'` with `req`/`res`/`msg` - API request completion line.
    - `action === 'renewAccessToken'` - OAuth2 token renewal (red on error, yellow on success); also dumps `expires`, `scopes`, and `response.error` details.
    - `src === 'connection'` with `host`+`port` - IMAP connection establishment.
    - `src === 'tls'` with `algo`+`version` - TLS session info.
    - `src` + `data` (base64) - raw socket bytes; `src === 's'` is server->client (xterm color 39), anything else is client->server (color 119). The `[SC]` prefix flags secure/compressed.
- `this.prevConn` tracks the last printed `cid` (connection id). Whenever a new `cid` is seen, a bold connection header is emitted before the line, so multi-line raw dumps stay grouped under the connection they belong to.

### Filtering

`minimist` parses `--filter.<key>=<value>` into `argv.filter`, which becomes the `filter` object. Repeating the same flag yields an array of values for that key.

Filter semantics in `_write`:

- All filter keys must match (AND across keys); within a key, any listed value matches (OR across values).
- Numeric coercion is applied when the log field is a number; string coercion when it is a string.
- Special case: filtering by `account` also matches API log entries whose `req.url` contains `/<account>/`, even when the entry has no `account` field. In that case `chunk.value.account` is back-filled from the filter so downstream output shows it. Keep this behavior in mind when adding new filterable keys - the rest of the matcher is generic, this branch is not.

### Adding a new log shape

Add another `if (chunk && chunk.value && ...)` block in `_write`. Follow the existing conventions: build a `${timePrefix}LABEL:` prefix (`timePrefix` is empty when the user passed `--no-time`), use `clc.xterm(<color>)` for coloring, and if the entry belongs to a connection, emit a `prevConn` header first so it groups correctly with surrounding raw traffic (`_printConnHeader` is a no-op under `--no-cid`).

## Releases

Releases are automated with release-please (`.github/workflows/release.yaml`, `release-please-config.json`, `release-type: node`). Pushes to `master` with Conventional Commit messages drive the version bump and `CHANGELOG.md`: `fix:`/`feat:` open a release PR, while `chore:`/docs/CI commits do not trigger a release. Merging the release PR publishes to npm with provenance from the `npm-publish` GitHub environment - so commit messages are load-bearing, not cosmetic.

## Conventions

These mirror the conventions used across Postal Systems projects (see `../emailengine`).

**Git commits**

- Use Conventional Commits: `fix:` (patch release), `feat:` (minor release), and `chore:`/`docs:`/`ci:`/`build:`/`style:`/`refactor:`/`test:` for changes that should not trigger a release. release-please derives the version and changelog from these prefixes.
- Do **not** list Claude or any AI assistant as a co-author / co-contributor in commit messages or PR descriptions (no `Co-Authored-By` trailer).
- Append `[skip ci]` to commits that do not change runtime behavior (docs, comments, formatting) to avoid spending CI minutes. Exception: never add `[skip ci]` to a `fix:` or `feat:` commit, those must run so the release workflow triggers. GitHub reads the marker off the HEAD commit of a push, so when a push mixes the two, the release-triggering commit has to be last.

**Code & docs style**

- No emojis anywhere in code or documentation, printable ASCII only.
- Use a single hyphen-minus (`-`) as a dash in user-facing strings and docs. Never use double hyphens (`--`), em dashes, or en dashes.

**Before committing code changes**

1. `npm run format` and `npm run lint`
2. `npm test`
3. For non-trivial changes, consider `/simplify` (quality cleanup) and `/security-review`. This tool prints untrusted log data to a terminal, so anything touching `sanitize()` / `CONTROL_RE` is security-sensitive.

**After pushing**

- Check the workflow runs for the push (`gh run list --branch master`) and report their status. If a run fails for an unrelated/infrastructure reason (checkout reporting "account suspended", HTTP 403, other auth errors), check <https://www.githubstatus.com/> for an active GitHub incident before assuming the change caused it.
