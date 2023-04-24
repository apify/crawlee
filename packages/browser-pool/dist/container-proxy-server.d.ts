/**
 * Creates a proxy server designed to handle requests from "container" instances.
 * Each container instance is assigned to a different (but still localhost) IP address
 * in order to work around authorization and to enable upstream.
 * @internal
 */
export declare function createProxyServerForContainers(fallbackProxyUrl?: string): Promise<{
    port: number;
    ipToProxy: Map<string, string>;
    close(closeConnections: boolean): Promise<void>;
}>;
//# sourceMappingURL=container-proxy-server.d.ts.map