'use strict';

const fastJsonParse = require('fast-json-parse');
const pump = require('pump');
const split = require('split2');
const { Writable } = require('stream');
const clc = require('cli-color');

class Logger extends Writable {
    constructor(opts) {
        opts = opts || {};

        super({
            objectMode: true
        });

        this.prevConn = false;
    }

    _write(chunk, encoding, callback) {
        let time;

        if (chunk && chunk.value) {
            time = new Date(chunk.value.time).toISOString().substr(0, 19).replace(/T/, ' ');
        }

        if (chunk && chunk.value && chunk.value.src === 'connection' && chunk.value.host && chunk.value.port) {
            if (!this.prevConn || this.prevConn.cid !== chunk.value.cid) {
                this.prevConn = chunk.value;
                // show connection header
                console.log(`${clc.bold(`${chunk.value.cid}${chunk.value.account ? ` [${chunk.value.account}]` : ''}`)}`);
            }

            console.log(
                `${clc.xterm(8)(
                    `[${time}] Connection established to ${chunk.value.host}:${chunk.value.port} (${chunk.value.secure ? chunk.value.version : 'no tls'})`
                )}`
            );
        }

        if (chunk && chunk.value && chunk.value.src && chunk.value.data) {
            let prefix = `[${time}] ${chunk.value.src.toUpperCase().trim()}: `;
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

        callback();
    }
}

pump(process.stdin, split(fastJsonParse), new Logger({}));
process.on('SIGINT', function () {
    process.exit(0);
});
