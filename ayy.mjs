import net from 'net';
import { firefox } from 'playwright';
import { buffer } from 'stream/consumers';

const RDP_PORT = 12345;

const browser = await firefox.launchPersistentContext('/tmp/firefox-lol-random/', {
    headless: false,
    args: [ '-start-debugger-server', String(RDP_PORT), '--remote-allow-hosts', '127.0.0.1' ],
    firefoxUserPrefs: {
        'devtools.debugger.remote-enabled': true,
        'devtools.debugger.prompt-connection': false,
    }
});

const loadAddon = (port, host, addonPath) => {
    return new Promise(resolve => {
        const socket = net.connect({
            port,
            host,
        });

        let success = false;

        socket.once('error', () => {});
        socket.once('close', () => {
            resolve(success);
        });

        const send = (data) => {
            const raw = Buffer.from(JSON.stringify(data));

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
            if (remainingBytes === 0) {
                const index = data.indexOf(':');

                buffers.push(data);

                if (index === -1) {
                    return;
                }

                const buffer = Buffer.concat(buffers);
                const bufferIndex = buffer.indexOf(':');

                buffers.length = 0;
                remainingBytes = Number(buffer.subarray(0, bufferIndex).toString());
                data = buffer.subarray(bufferIndex + 1);
            }

            if (remainingBytes !== 0) {
                remainingBytes -= data.length;
                buffers.push(data);

                if (remainingBytes === 0) {
                    const buffer = Buffer.concat(buffers);
                    buffers.length = 0;

                    const json = JSON.parse(buffer.toString());
                    onMessage(json);
                } else if (remainingBytes < 0) {
                    throw new Error('Invalid state');
                }
            }
        });
    });
};

console.log(await loadAddon(RDP_PORT, '127.0.0.1', '/home/szm/Desktop/crawlee/packages/browser-pool/tab-as-a-container'));

browser.newPage();
