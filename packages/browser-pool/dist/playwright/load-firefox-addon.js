"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadFirefoxAddon = void 0;
const tslib_1 = require("tslib");
const buffer_1 = require("buffer");
const net_1 = tslib_1.__importDefault(require("net"));
const loadFirefoxAddon = (port, host, addonPath) => {
    return new Promise((resolve) => {
        const socket = net_1.default.connect({
            port,
            host,
        });
        let success = false;
        socket.once('error', () => { });
        socket.once('close', () => {
            resolve(success);
        });
        const send = (data) => {
            const raw = buffer_1.Buffer.from(JSON.stringify(data));
            socket.write(`${raw.length}`);
            socket.write(':');
            socket.write(raw);
        };
        send({
            to: 'root',
            type: 'getRoot',
        });
        const onMessage = (message) => {
            if (message.addonsActor) {
                send({
                    to: message.addonsActor,
                    type: 'installTemporaryAddon',
                    addonPath,
                });
            }
            if (message.addon) {
                success = true;
                socket.end();
            }
            if (message.error) {
                socket.end();
            }
        };
        const buffers = [];
        let remainingBytes = 0;
        socket.on('data', (data) => {
            // eslint-disable-next-line no-constant-condition
            while (true) {
                if (remainingBytes === 0) {
                    const index = data.indexOf(':');
                    buffers.push(data);
                    if (index === -1) {
                        return;
                    }
                    const buffer = buffer_1.Buffer.concat(buffers);
                    const bufferIndex = buffer.indexOf(':');
                    buffers.length = 0;
                    remainingBytes = Number(buffer.subarray(0, bufferIndex).toString());
                    if (!Number.isFinite(remainingBytes)) {
                        throw new Error('Invalid state');
                    }
                    data = buffer.subarray(bufferIndex + 1);
                }
                if (data.length < remainingBytes) {
                    remainingBytes -= data.length;
                    buffers.push(data);
                    break;
                }
                buffers.push(data.subarray(0, remainingBytes));
                const buffer = buffer_1.Buffer.concat(buffers);
                buffers.length = 0;
                const json = JSON.parse(buffer.toString());
                queueMicrotask(() => {
                    onMessage(json);
                });
                const remainder = data.subarray(remainingBytes);
                remainingBytes = 0;
                if (remainder.length === 0) {
                    break;
                }
                data = remainder;
            }
        });
    });
};
exports.loadFirefoxAddon = loadFirefoxAddon;
//# sourceMappingURL=load-firefox-addon.js.map