# Raw log viewer for EmailEngine

[EmailEngine](https://emailengine.app/) logs all output in Pino format. If the `EENGINE_LOG_RAW=true` environment variable or the `--log.raw=true` argument is set, then EmailEngine also includes the raw data sent to and read from the IMAP socket. This utility reads those logs from standard input and displays them in a human readable, color-coded form.

## Install

Requires Node.js 20 or later.

```
$ npm install eerawlog -g
$ EENGINE_LOG_RAW=true emailengine | eerawlog
```

## What it shows

eerawlog reads EmailEngine's NDJSON log lines from stdin and pretty-prints the entries it recognizes; unrecognized entries are ignored, while lines that are not valid JSON are echoed as-is so nothing in the stream is silently lost. Recognized entries are:

- Raw IMAP socket traffic, decoded and color-coded by direction (client → server and server → client) and grouped under the connection it belongs to
- IMAP connection and TLS session establishment
- Incoming API requests (route handler entries and request-completion lines)
- OAuth2 access-token renewals, including provisioned scopes and error details

## Filtering output

Filter by any key present in the log entries with a `--filter.<key>=<value>` argument:

- Repeat the same key to match **any** of several values (OR).
- Combine different keys to require **all** of them to match (AND).

**Example.** Only display traffic for accounts `"account1"` and `"account2"`:

```
$ EENGINE_LOG_RAW=true emailengine | eerawlog --filter.account="account1" --filter.account="account2"
```

When filtering by `account`, API log entries are also matched by the account segment in their request URL, even if the entry itself has no `account` field.

## Hiding prefixes

For screenshots or documentation the timestamp and connection-id decorations can be turned off:

- `--no-time` hides the `[YYYY-MM-DD HH:MM:SS]` prefix on every rendered line
- `--no-cid` hides the bold connection-id header lines that group raw traffic by connection

```
$ EENGINE_LOG_RAW=true emailengine | eerawlog --no-time --no-cid
```

## Example screenshot

![](https://cldup.com/0z5i7LU-_A.png)

## License

Licensed under the **ISC** license.
