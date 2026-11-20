import net from 'node:net';
import os from 'node:os';

import { getLocalProxyAddress } from '../../packages/browser-pool/src/proxy-server.js';

const externalAddress = Object.values(os.networkInterfaces())
    .flat()
    .find((iface) => iface?.family === 'IPv4' && !iface.internal)?.address;

const canConnect = async (host: string, port: number) =>
    new Promise<boolean>((resolve) => {
        const socket = net.connect({ host, port, timeout: 1000 });
        const finish = (connected: boolean) => {
            socket.destroy();
            resolve(connected);
        };

        socket.once('connect', () => finish(true));
        socket.once('timeout', () => finish(false));
        socket.once('error', () => finish(false));
    });

describe('local proxy server', () => {
    test('accepts connections on the loopback interface', async () => {
        const { port } = new URL(await getLocalProxyAddress());

        expect(await canConnect('127.0.0.1', Number(port))).toBe(true);
    });

    test('does not accept connections on other interfaces', async ({ skip }) => {
        if (!externalAddress) {
            skip();
            return;
        }

        const { port } = new URL(await getLocalProxyAddress());

        expect(await canConnect(externalAddress, Number(port))).toBe(false);
    });
});
