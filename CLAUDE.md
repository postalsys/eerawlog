# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`eerawlog` is a small Node CLI that pretty-prints [EmailEngine](https://emailengine.app/) logs. EmailEngine emits NDJSON Pino logs, and when run with `EENGINE_LOG_RAW=true` it also includes base64-encoded raw IMAP socket traffic. This tool reads those log lines from stdin and renders selected entry types in a human-readable, color-coded form.

Typical invocation: `EENGINE_LOG_RAW=true emailengine | eerawlog [--filter.<key>=<value> ...]`

There is no build step. Source is plain CommonJS; `bin/eerawlog.js` is a one-line shim that `require`s `index.js`.

## Commands

- `npm test` — runs `test/cli.test.js` via `node --test`. These are **black-box CLI tests**: each case spawns `bin/eerawlog.js` as a subprocess, pipes NDJSON to its stdin, strips ANSI with `clc.strip`, and asserts on stdout. There are no unit tests of internal functions — behavior is pinned only through the CLI surface, so a change to rendering must be validated by feeding representative log lines.
- Run one test by name: `node --test --test-name-pattern="filter.account back-fill" test/cli.test.js`.
- Lint/format config exists (`.eslintrc` extends `nodemailer` + `prettier`, `ecmaVersion` 2018; `.prettierrc.js`: 4-space, single quotes, 160 col, no trailing commas) but ESLint/Prettier are **not** in `devDependencies` and there is no lint/format npm script — run them via `npx` if you need to.
- `npm run update` — wipes `node_modules`/`package-lock.json`, runs `ncu -u`, reinstalls. See the dependency constraint below before accepting any bump.

## Dependencies: CommonJS only

eerawlog sits in the EmailEngine dependency tree, which is loaded with `require()` and **cannot** use ESM. Every dependency — direct and transitive — must ship real CommonJS, not ESM and not a thin CommonJS wrapper around an ESM module. After `npm run update` or any dependency bump, verify this before committing:

- No installed `package.json` may declare `"type": "module"` unless it also exposes a genuine CommonJS entry via an `exports` `require` condition. Quick scan (expect no matches): `grep -rl '"type": *"module"' node_modules/*/package.json node_modules/@*/*/package.json`.
- Do **not** rely on "the tests still pass". Node 24 enables `require(esm)`, so an ESM-only dependency loads transparently at runtime and hides the problem — inspect the package metadata, not the runtime behavior.
- If a dependency's new major has gone ESM-only, pin it to the last CommonJS release (via `.ncurc.js` or an explicit version in `package.json`) instead of upgrading.

## Architecture

Almost everything lives in `index.js` (~180 lines). The pipeline is:

```
process.stdin → split2(Parse) → Logger (Writable, objectMode) → process.stdout
```

- `Parse(data)` is a per-line factory invoked by `split2`. It returns an object with either `{value: <parsedJSON>}` on success or `{err, input}` on failure (so malformed lines are still printed in yellow rather than crashing).
- `Logger._write` is a chain of independent `if` blocks, one per recognized log shape. A single chunk may match multiple blocks (e.g. a connection event also containing TLS info). The recognized shapes are:
  - `action === 'onPreHandler'` with `path` starting `/v1/` — Hapi route handler entry.
  - `component === 'api'` with `req`/`res`/`msg` — API request completion line.
  - `action === 'renewAccessToken'` — OAuth2 token renewal (red on error, yellow on success); also dumps `expires`, `scopes`, and `response.error` details.
  - `src === 'connection'` with `host`+`port` — IMAP connection establishment.
  - `src === 'tls'` with `algo`+`version` — TLS session info.
  - `src` + `data` (base64) — raw socket bytes; `src === 's'` is server→client (xterm color 39), anything else is client→server (color 119). The `[SC]` prefix flags secure/compressed.
- `this.prevConn` tracks the last printed `cid` (connection id). Whenever a new `cid` is seen, a bold connection header is emitted before the line, so multi-line raw dumps stay grouped under the connection they belong to.

### Filtering

`minimist` parses `--filter.<key>=<value>` into `argv.filter`, which becomes the `filter` object. Repeating the same flag yields an array of values for that key.

Filter semantics in `_write`:
- All filter keys must match (AND across keys); within a key, any listed value matches (OR across values).
- Numeric coercion is applied when the log field is a number; string coercion when it is a string.
- Special case: filtering by `account` also matches API log entries whose `req.url` contains `/<account>/`, even when the entry has no `account` field. In that case `chunk.value.account` is back-filled from the filter so downstream output shows it. Keep this behavior in mind when adding new filterable keys — the rest of the matcher is generic, this branch is not.

### Adding a new log shape

Add another `if (chunk && chunk.value && ...)` block in `_write`. Follow the existing conventions: build a `${timePrefix}LABEL:` prefix (`timePrefix` is empty when the user passed `--no-time`), use `clc.xterm(<color>)` for coloring, and if the entry belongs to a connection, emit a `prevConn` header first so it groups correctly with surrounding raw traffic (`_printConnHeader` is a no-op under `--no-cid`).

## Releases

Releases are automated with release-please (`.github/workflows/release.yaml`, `release-please-config.json`, `release-type: node`). Pushes to `master` with Conventional Commit messages drive the version bump and `CHANGELOG.md`: `fix:`/`feat:` open a release PR, while `chore:`/docs/CI commits do not trigger a release. Merging the release PR publishes to npm with provenance from the `npm-publish` GitHub environment — so commit messages are load-bearing, not cosmetic.
