import { Buffer } from 'buffer';
import net from 'net';

export const loadFirefoxAddon = (port: number, host: string, addonPath: string) => {
    return new Promise<boolean>((resolve) => {
        const socket = net.connect({
            port,
            host,
        });

        let success = false;

        socket.once('error', () => {});
        socket.once('close', () => {
            resolve(success);
        });

        const send = (data: Record<string, string>) => {
            const raw = Buffer.from(JSON.stringify(data));

            socket.write(`${raw.length}`);
            socket.write(':');
            socket.write(raw);
        };

        send({
            to: 'root',
            type: 'getRoot',
        });

        const onMessage = (message: any) => {
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

        const buffers: Buffer[] = [];
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
