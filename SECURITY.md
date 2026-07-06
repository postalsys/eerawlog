# Security Policy

eerawlog is a command-line viewer for [EmailEngine](https://emailengine.app/)
logs. It reads NDJSON (Pino) log lines from stdin and pretty-prints selected
entries, including base64-encoded raw IMAP socket traffic that EmailEngine
captures when run with `EENGINE_LOG_RAW=true`. That raw traffic originates from
remote IMAP servers, which may be malicious or buggy, and the decoded bytes are
written to the operator's terminal. Because eerawlog processes untrusted input
and renders it to a terminal, we take security reports seriously and aim to
respond quickly.

## Supported Versions

Security fixes are released only against the latest version. We do not backport
patches to older releases - upgrading to the current release line is the
supported way to receive security updates.

| Version | Supported          |
| ------- | ------------------ |
| 1.x     | :white_check_mark: |
| < 1.0   | :x:                |

If you are on an older version, please upgrade. See the release notes at
<https://github.com/postalsys/eerawlog/releases> before updating.

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues,
pull requests, or discussions.**

Report privately through one of the following channels:

1. **GitHub Security Advisories (preferred).** Open a private report at
   <https://github.com/postalsys/eerawlog/security/advisories/new>. This keeps
   the discussion private until a fix is published and lets us credit you.
2. **Email.** Send details to **andris@postalsys.com** (the contact listed in
   [`SECURITY.txt`](SECURITY.txt)). Encrypt sensitive details with the PGP key
   referenced there if possible.

When reporting, please include as much of the following as you can:

- The affected version(s) and environment (eerawlog version, Node.js version,
  OS, and terminal emulator).
- The component involved (e.g. the NDJSON line parser, the base64 raw-socket
  decoding, the terminal rendering/coloring, or the `--filter.*` matching).
- A clear description of the issue and its impact (e.g. terminal escape or
  control-sequence injection from decoded raw traffic, a parser crash or hang,
  memory exhaustion or denial of service from malformed or oversized log lines,
  or prototype pollution).
- A minimal proof of concept or reproduction steps - ideally a sample log line
  (with credentials and tokens redacted) or a short script that triggers the
  issue.
- Any suggested remediation, if you have one.

We are a small team, so there is no guaranteed response time - sometimes reports
are handled within hours, sometimes they take longer. Accepted issues are fixed
in a new release and coordinated through a GitHub Security Advisory, and
reporters who wish to be named are credited.

## CVEs

We track and disclose vulnerabilities through GitHub Security Advisories. We do
not request or manage CVE identifiers ourselves. If you need a CVE assigned for a
reported issue, please request one yourself - for example, through GitHub's own
CVE request flow on the published advisory, or another CNA.

## Scope

In scope: the eerawlog source in this repository - the per-line NDJSON parser
(including handling of malformed or oversized lines), the base64 decoding of raw
IMAP socket traffic, the terminal rendering path that writes decoded server and
client bytes to stdout (including handling of embedded escape/control
sequences), and the `--filter.*` argument matching.

Out of scope:

- Vulnerabilities in EmailEngine itself, or in the IMAP servers whose traffic
  appears in the logs (please report those to their respective projects).
- The content of the logs you feed in. EmailEngine logs may contain credentials,
  access tokens, or message data; keeping those logs and their storage secure is
  the operator's responsibility, not a vulnerability in eerawlog.
- Vulnerabilities in your terminal emulator's own handling of escape or control
  sequences, or in third-party dependencies (please report those to their
  respective maintainers; we will upgrade once a fix is available).
- Issues that require an already-compromised host or local access to the machine
  running eerawlog.
- Social-engineering reports and theoretical issues without a demonstrated,
  concrete impact.

Thank you for helping keep eerawlog and its users safe.
