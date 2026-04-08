'use strict';

const pump = require('pump');
const split = require('split2');
const { Writable } = require('stream');
const clc = require('cli-color');
const argv = require('minimist')(process.argv.slice(2));

const filter = Object.assign({}, (typeof argv.filter === 'object' && !Array.isArray(argv.filter) && argv.filter) || {});
const filterKeys = Object.keys(filter);

const V1_PATH_RE = /^\/v1\//;
const CR_RE = /\r/g;
const TRAILING_LF_RE = /\n$/;
const LF_RE = /\n/g;

const GREY = clc.xterm(8);
const RED = clc.xterm(9);
const YELLOW = clc.xterm(11);
const MAGENTA = clc.xterm(13);
const SERVER = clc.xterm(39);
const CLIENT = clc.xterm(119);

function Parse(data) {
    if (!(this instanceof Parse)) {
        return new Parse(data);
    }
    this.err = null;
    this.value = null;
    try {
        this.value = JSON.parse(data);
    } catch (err) {
        this.err = err;
        this.input = data;
    }
}

function accountTag(account) {
    return account ? ` [${account}]` : '';
}

// Re-indent a multi-line string so continuation lines align under the prefix.
function padMultiline(text, indent) {
    return text.replace(CR_RE, '').replace(TRAILING_LF_RE, '').replace(LF_RE, `\n${indent}`);
}

class Logger extends Writable {
    constructor() {
        super({ objectMode: true });
        this.prevConn = false;
    }

    // Print a bold connection header the first time we see a new cid so
    // multi-line raw dumps stay grouped under the connection they belong to.
    _printConnHeader(value) {
        if (this.prevConn && this.prevConn.cid === value.cid) {
            return;
        }
        this.prevConn = value;
        console.log(clc.bold(`${value.cid}${accountTag(value.account)}`));
    }

    _write(chunk, encoding, callback) {
        try {
            if (chunk.err && chunk.input) {
                console.log(YELLOW(chunk.input));
            }

            if (!chunk.value) {
                return;
            }

            const value = chunk.value;
            const time = new Date(value.time || Date.now()).toISOString().slice(0, 19).replace('T', ' ');

            for (const key of filterKeys) {
                let hasMatch = false;
                for (let val of [].concat(filter[key] || [])) {
                    if (typeof value[key] === 'number' && !isNaN(val)) {
                        val = Number(val);
                    } else if (typeof value[key] === 'string') {
                        val = val.toString();
                    }

                    if (value[key] === val) {
                        hasMatch = true;
                    } else if (key === 'account' && value.component === 'api' && value.req?.url?.includes(`/${val}/`)) {
                        hasMatch = true;
                        value.account = value.account || val;
                    }
                }
                if (!hasMatch) {
                    return;
                }
            }

            if (value.action === 'onPreHandler' && V1_PATH_RE.test(value.path)) {
                console.log(`${GREY(`[${time}] H:`)} ${MAGENTA(`${value.method.toUpperCase()} ${value.path}${accountTag(value.account)}`)}`);
            }

            if (value.component === 'api' && value.req && value.res && value.msg) {
                console.log(
                    YELLOW(
                        `[${time}] API${clc.bold(accountTag(value.account))}: ${value.req.method.toUpperCase()} ${value.req.url} ${value.res.statusCode} (${value.responseTime}ms)`
                    )
                );
            }

            if (value.action === 'renewAccessToken') {
                const prefix = `[${time}] `;
                const indent = ' '.repeat(prefix.length);
                const color = value.error ? RED : YELLOW;
                const pad = text => color(indent + padMultiline(text, indent));

                console.log(
                    color(`${prefix}OAuth2${clc.bold(accountTag(value.account))}: ${value.msg}${value.flag?.message ? `: ${value.flag.message}` : ''}`)
                );

                if (value.expires) {
                    console.log(pad(`Expires on ${value.expires}`));
                }

                if (value.scopes) {
                    console.log(pad('Provisioned scopes:\n- ' + value.scopes.join('\n- ')));
                }

                if (value.response?.error) {
                    console.log(
                        pad(
                            Object.keys(value.response)
                                .map(k => `${k}: ${value.response[k]}`)
                                .join('\n')
                        )
                    );
                }
            }

            if (value.src === 'connection' && value.host && value.port) {
                this._printConnHeader(value);
                console.log(
                    GREY(
                        `[${time}] Connection established to ${value.host}:${value.port} (${
                            value.secure ? `${value.version} / ${value.algo}, ${value.authorized ? 'valid' : 'invalid'} certificate` : 'no tls'
                        })`
                    )
                );
            }

            if (value.src === 'tls' && value.algo && value.version) {
                this._printConnHeader(value);
                console.log(
                    GREY(`[${time}] TLS Session established using ${value.version} / ${value.algo}, ${value.authorized ? 'valid' : 'invalid'} certificate`)
                );
            }

            if (value.src && value.data) {
                const prefix = `[${time}] ${value.src.toUpperCase().trim()}: [${value.secure ? 'S' : ' '}${value.compress ? 'C' : ' '}] `;
                const indent = ' '.repeat(prefix.length);
                const color = value.src === 's' ? SERVER : CLIENT;
                this._printConnHeader(value);
                console.log(`${GREY(prefix)}${color(padMultiline(Buffer.from(value.data, 'base64').toString(), indent))}`);
            }
        } catch (err) {
            console.error(err);
        } finally {
            callback();
        }
    }

    _final(callback) {
        console.log(GREY('input stream ended'));
        callback();
    }
}

pump(process.stdin, split(Parse), new Logger());
process.on('SIGINT', function () {
    process.exit(0);
});
