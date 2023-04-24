"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createProxyServerForContainers = void 0;
const proxy_chain_1 = require("proxy-chain");
/**
 * Creates a proxy server designed to handle requests from "container" instances.
 * Each container instance is assigned to a different (but still localhost) IP address
 * in order to work around authorization and to enable upstream.
 * @internal
 */
async function createProxyServerForContainers(fallbackProxyUrl) {
    const ipToProxy = new Map();
    const proxyServer = new proxy_chain_1.Server({
        prepareRequestFunction({ request }) {
            const prefix4to6 = '::ffff:';
            const localAddress = request.socket.localAddress.startsWith(prefix4to6)
                ? request.socket.localAddress.slice(prefix4to6.length)
                : request.socket.localAddress;
            const upstreamProxyUrl = ipToProxy.get(localAddress);
            if (upstreamProxyUrl === undefined) {
                if (fallbackProxyUrl) {
                    return {
                        upstreamProxyUrl: fallbackProxyUrl,
                        requestAuthentication: false,
                    };
                }
                // eslint-disable-next-line no-console
                console.warn(`Request without proxy ${localAddress} ${request.headers.host}`);
            }
            return {
                upstreamProxyUrl,
                requestAuthentication: false,
            };
        },
        port: 0,
    });
    await proxyServer.listen();
    proxyServer.server.unref();
    return {
        port: proxyServer.port,
        ipToProxy,
        async close(closeConnections) {
            return proxyServer.close(closeConnections);
        },
    };
}
exports.createProxyServerForContainers = createProxyServerForContainers;
;
//# sourceMappingURL=container-proxy-server.js.map