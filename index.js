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
        if (chunk && chunk.value && chunk.value.src && chunk.value.data) {
            let time = new Date(chunk.value.time).toISOString().substr(0, 19).replace(/T/, ' ');
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
                console.log(`${clc.bold(`${chunk.value.account} ${chunk.value.cid}`)}`);
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
