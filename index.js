'use strict';

const pump = require('pump');
const split = require('split2');
const { Writable } = require('stream');
const clc = require('cli-color');
const argv = require('minimist')(process.argv.slice(2));

const filter = Object.assign({}, (typeof argv.filter === 'object' && !Array.isArray(argv.filter) && argv.filter) || {});

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

class Logger extends Writable {
    constructor(opts) {
        opts = opts || {};

        super({
            objectMode: true
        });

        this.prevConn = false;
    }

    _write(chunk, encoding, callback) {
        try {
            let time;

            if (chunk && chunk.err && chunk.input) {
                console.log(clc.xterm(11)(chunk.input));
            }

            if (chunk && chunk.value) {
                time = new Date(chunk.value.time || Date.now()).toISOString().substr(0, 19).replace(/T/, ' ');
            }

            if (chunk && chunk.value) {
                for (let key of Object.keys(filter)) {
                    let hasMatch = false;
                    for (let val of [].concat(filter[key] || [])) {
                        if (typeof chunk.value[key] === 'number' && !isNaN(val)) {
                            val = Number(val);
                        } else if (typeof chunk.value[key] === 'string') {
                            val = val.toString();
                        }

                        if (chunk.value[key] === val) {
                            hasMatch = true;
                        }
                    }
                    if (!hasMatch) {
                        // does not match filter
                        return;
                    }
                }
            }

            if (chunk.value && chunk.value.action === 'onPreHandler' && /^\/v1\//.test(chunk.value.path)) {
                console.log(
                    `${clc.xterm(8)(`[${time}] H:`)} ${clc.xterm(13)(
                        `${chunk.value.method.toUpperCase()} ${chunk.value.path}${chunk.value.account ? ` [${chunk.value.account}]` : ''}`
                    )}`
                );
            }

            if (chunk && chunk.value && chunk.value.src === 'connection' && chunk.value.host && chunk.value.port) {
                if (!this.prevConn || this.prevConn.cid !== chunk.value.cid) {
                    this.prevConn = chunk.value;
                    // show connection header
                    console.log(`${clc.bold(`${chunk.value.cid}${chunk.value.account ? ` [${chunk.value.account}]` : ''}`)}`);
                }

                console.log(
                    `${clc.xterm(8)(
                        `[${time}] Connection established to ${chunk.value.host}:${chunk.value.port} (${
                            chunk.value.secure
                                ? `${chunk.value.version} / ${chunk.value.algo}, ${chunk.value.authorized ? 'valid' : 'invalid'} certificate`
                                : 'no tls'
                        })`
                    )}`
                );
            }

            if (chunk && chunk.value && chunk.value.src === 'tls' && chunk.value.algo && chunk.value.version) {
                if (!this.prevConn || this.prevConn.cid !== chunk.value.cid) {
                    this.prevConn = chunk.value;
                    // show connection header
                    console.log(`${clc.bold(`${chunk.value.cid}${chunk.value.account ? ` [${chunk.value.account}]` : ''}`)}`);
                }

                console.log(
                    `${clc.xterm(8)(
                        `[${time}] TLS Session established using ${chunk.value.version} / ${chunk.value.algo}, ${
                            chunk.value.authorized ? 'valid' : 'invalid'
                        } certificate`
                    )}`
                );
            }

            if (chunk && chunk.value && chunk.value.src && chunk.value.data) {
                let prefix = `[${time}] ${chunk.value.src.toUpperCase().trim()}: [${chunk.value.secure ? 'S' : ' '}${chunk.value.compress ? 'C' : ' '}] `;
                let pad = val => {
                    val = val
                        .replace(/\r/g, '')
                        .replace(/\n$/, '')
                        .replace(/\n/g, `\n${' '.repeat(prefix.length)}`);

                    let col = chunk.value.src === 's' ? 39 : 119;

                    return clc.xterm(col)(val);
                };
                if (!this.prevConn || this.prevConn.cid !== chunk.value.cid) {
                    this.prevConn = chunk.value;
                    // show connection header
                    console.log(`${clc.bold(`${chunk.value.cid}${chunk.value.account ? ` [${chunk.value.account}]` : ''}`)}`);
                }

                console.log(`${clc.xterm(8)(prefix)}${pad(Buffer.from(chunk.value.data, 'base64').toString())}`);
            }
        } catch (err) {
            console.error(err);
        } finally {
            callback();
        }
    }

    _final(callback) {
        console.log(clc.xterm(8)(`input stream ended`));
        callback();
    }
}

pump(process.stdin, split(Parse), new Logger({}));
process.on('SIGINT', function () {
    process.exit(0);
});
