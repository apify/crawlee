import { Server as ProxyChainServer } from 'proxy-chain';

// --proxy-bypass-list=<-loopback> for launching Chrome
export const createProxyServer = (localAddress: string, username: string, password: string) => {
    return new ProxyChainServer({
        port: 0,
        prepareRequestFunction: (input) => {
            return {
                localAddress,
                requestAuthentication: input.username !== username || input.password !== password,
            };
        },
    });
};
