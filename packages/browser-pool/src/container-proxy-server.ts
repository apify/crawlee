import { Server as ProxyChainServer } from 'proxy-chain';

/**
 * Creates a proxy server designed to handle requests from "container" instances.
 * Each container instance is assigned to a different (but still localhost) IP address
 * in order to work around authorization and to enable upstream.
 * @internal
 */
export async function createProxyServerForContainers() {
    const ipToProxy = new Map<string, string>();

    const proxyServer = new ProxyChainServer({
        prepareRequestFunction({ request }) {
            const prefix4to6 = '::ffff:';
            const localAddress = request.socket.localAddress!.startsWith(prefix4to6)
                ? request.socket.localAddress!.slice(prefix4to6.length)
                : request.socket.localAddress!;

            const upstreamProxyUrl = ipToProxy.get(localAddress);

            if (upstreamProxyUrl === undefined) {
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
        async close(closeConnections: boolean) {
            return proxyServer.close(closeConnections);
        },
    };
};
