'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');

const BIN = path.join(__dirname, '..', 'bin', 'eerawlog.js');

// Strip ANSI SGR escape sequences (cli-color uses xterm-256 + bold/reset).
function stripAnsi(str) {
    // eslint-disable-next-line no-control-regex
    return str.replace(/\x1B\[[0-9;]*m/g, '');
}

function runCli(input, args = []) {
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [BIN, ...args], {
            stdio: ['pipe', 'pipe', 'pipe']
        });
        let stdout = '';
        let stderr = '';
        child.stdout.setEncoding('utf8');
        child.stderr.setEncoding('utf8');
        child.stdout.on('data', d => (stdout += d));
        child.stderr.on('data', d => (stderr += d));
        child.on('error', reject);
        child.on('close', code => {
            resolve({ code, stdout: stripAnsi(stdout), stderr: stripAnsi(stderr) });
        });
        child.stdin.end(input);
    });
}

// Fixed timestamp so rendered "[YYYY-MM-DD HH:MM:SS]" prefixes are stable.
const FIXED_MS = Date.UTC(2024, 0, 15, 12, 30, 45);
const FIXED_STR = '2024-01-15 12:30:45';

function line(obj) {
    return JSON.stringify(obj) + '\n';
}

test('prints "input stream ended" on empty stdin', async () => {
    const { code, stdout } = await runCli('');
    assert.equal(code, 0);
    assert.match(stdout, /input stream ended/);
});

test('echoes malformed JSON lines verbatim', async () => {
    const { stdout } = await runCli('this is not json\n');
    assert.match(stdout, /this is not json/);
});

test('renders Hapi onPreHandler entries for /v1/ paths', async () => {
    const { stdout } = await runCli(
        line({
            time: FIXED_MS,
            action: 'onPreHandler',
            method: 'post',
            path: '/v1/account',
            account: 'acc1'
        })
    );
    assert.match(stdout, new RegExp(`\\[${FIXED_STR}\\] H: POST /v1/account \\[acc1\\]`));
});

test('skips onPreHandler entries for non-/v1/ paths', async () => {
    const { stdout } = await runCli(
        line({
            time: FIXED_MS,
            action: 'onPreHandler',
            method: 'get',
            path: '/health',
            account: 'acc1'
        })
    );
    assert.doesNotMatch(stdout, /\/health/);
});

test('renders API request completion lines', async () => {
    const { stdout } = await runCli(
        line({
            time: FIXED_MS,
            component: 'api',
            msg: 'request completed',
            account: 'acc1',
            req: { method: 'get', url: '/v1/messages' },
            res: { statusCode: 200 },
            responseTime: 42
        })
    );
    assert.match(stdout, new RegExp(`\\[${FIXED_STR}\\] API \\[acc1\\]: GET /v1/messages 200 \\(42ms\\)`));
});

test('renders successful OAuth2 token renewal with expires and scopes', async () => {
    const { stdout } = await runCli(
        line({
            time: FIXED_MS,
            action: 'renewAccessToken',
            account: 'acc1',
            msg: 'Renewed access token',
            expires: '2025-01-01T00:00:00Z',
            scopes: ['scope.one', 'scope.two']
        })
    );
    assert.match(stdout, /OAuth2 \[acc1\]: Renewed access token/);
    assert.match(stdout, /Expires on 2025-01-01T00:00:00Z/);
    assert.match(stdout, /Provisioned scopes:/);
    assert.match(stdout, /- scope\.one/);
    assert.match(stdout, /- scope\.two/);
});

test('renders failed OAuth2 token renewal with flag and response error', async () => {
    const { stdout } = await runCli(
        line({
            time: FIXED_MS,
            action: 'renewAccessToken',
            account: 'acc1',
            msg: 'Token renewal failed',
            error: true,
            flag: { message: 'invalid_grant' },
            response: { error: 'invalid_grant', error_description: 'token expired' }
        })
    );
    assert.match(stdout, /OAuth2 \[acc1\]: Token renewal failed: invalid_grant/);
    assert.match(stdout, /error: invalid_grant/);
    assert.match(stdout, /error_description: token expired/);
});

test('renders IMAP connection events with TLS info and connection header', async () => {
    const { stdout } = await runCli(
        line({
            time: FIXED_MS,
            src: 'connection',
            cid: 'conn-1',
            account: 'acc1',
            host: 'imap.example.com',
            port: 993,
            secure: true,
            version: 'TLSv1.3',
            algo: 'TLS_AES_256_GCM_SHA384',
            authorized: true
        })
    );
    assert.match(stdout, /^conn-1 \[acc1\]/m);
    assert.match(stdout, /Connection established to imap\.example\.com:993 \(TLSv1\.3 \/ TLS_AES_256_GCM_SHA384, valid certificate\)/);
});

test('renders plain (non-TLS) IMAP connection events', async () => {
    const { stdout } = await runCli(
        line({
            time: FIXED_MS,
            src: 'connection',
            cid: 'conn-plain',
            host: 'imap.example.com',
            port: 143,
            secure: false
        })
    );
    assert.match(stdout, /Connection established to imap\.example\.com:143 \(no tls\)/);
});

test('renders TLS session establishment lines', async () => {
    const { stdout } = await runCli(
        line({
            time: FIXED_MS,
            src: 'tls',
            cid: 'conn-2',
            account: 'acc1',
            version: 'TLSv1.3',
            algo: 'TLS_AES_256_GCM_SHA384',
            authorized: false
        })
    );
    assert.match(stdout, /^conn-2 \[acc1\]/m);
    assert.match(stdout, /TLS Session established using TLSv1\.3 \/ TLS_AES_256_GCM_SHA384, invalid certificate/);
});

test('decodes base64 raw socket data and emits a connection header', async () => {
    const payload = 'A1 LOGIN user pass\r\n';
    const { stdout } = await runCli(
        line({
            time: FIXED_MS,
            src: 'c',
            cid: 'conn-3',
            account: 'acc1',
            secure: true,
            data: Buffer.from(payload).toString('base64')
        })
    );
    assert.match(stdout, /^conn-3 \[acc1\]/m);
    assert.match(stdout, /C: \[S ] A1 LOGIN user pass/);
});

test('groups multiple raw lines under a single connection header per cid', async () => {
    const input =
        line({ time: FIXED_MS, src: 'c', cid: 'conn-A', data: Buffer.from('A1 NOOP\r\n').toString('base64') }) +
        line({ time: FIXED_MS, src: 's', cid: 'conn-A', data: Buffer.from('A1 OK\r\n').toString('base64') }) +
        line({ time: FIXED_MS, src: 'c', cid: 'conn-B', data: Buffer.from('B1 NOOP\r\n').toString('base64') });
    const { stdout } = await runCli(input);
    const headerCount = (stdout.match(/^conn-[AB]$/gm) || []).length;
    // conn-A header once, conn-B header once — three raw lines total.
    assert.equal(headerCount, 2);
    assert.match(stdout, /A1 NOOP/);
    assert.match(stdout, /A1 OK/);
    assert.match(stdout, /B1 NOOP/);
});

test('filter.account drops non-matching entries (AND-across-keys, OR-within-key)', async () => {
    const input =
        line({
            time: FIXED_MS,
            component: 'api',
            msg: 'r',
            account: 'acc1',
            req: { method: 'get', url: '/v1/x' },
            res: { statusCode: 200 },
            responseTime: 1
        }) +
        line({
            time: FIXED_MS,
            component: 'api',
            msg: 'r',
            account: 'acc2',
            req: { method: 'get', url: '/v1/y' },
            res: { statusCode: 200 },
            responseTime: 1
        });
    const { stdout } = await runCli(input, ['--filter.account=acc1']);
    assert.match(stdout, /\/v1\/x/);
    assert.doesNotMatch(stdout, /\/v1\/y/);
});

test('filter.account back-fills account from API req.url path segment', async () => {
    const { stdout } = await runCli(
        line({
            time: FIXED_MS,
            component: 'api',
            msg: 'r',
            // intentionally no `account` field — should still match via URL
            req: { method: 'get', url: '/v1/account/myacc/messages' },
            res: { statusCode: 200 },
            responseTime: 7
        }),
        ['--filter.account=myacc']
    );
    assert.match(stdout, /API \[myacc\]: GET \/v1\/account\/myacc\/messages 200 \(7ms\)/);
});
