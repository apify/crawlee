import ProxyChain from 'proxy-chain';

export const createProxyServerForContainers = async () => {
    const ipToProxy = new Map<string, string>();

    const proxyServer = new ProxyChain.Server({
        prepareRequestFunction({ request }) {
            const prefix4to6 = '::ffff:';
            const localAddress = request.socket.localAddress!.startsWith(prefix4to6)
                ? request.socket.localAddress!.slice(prefix4to6.length)
                : request.socket.localAddress!;

            return {
                upstreamProxyUrl: ipToProxy.get(localAddress),
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
