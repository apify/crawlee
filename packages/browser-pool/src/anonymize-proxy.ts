import { anonymizeProxy, closeAnonymizedProxy } from 'proxy-chain';

type PromiseVoid = () => Promise<void>;

export const anonymizeProxySugar = async (
    proxyUrl?: string,
    username?: string,
    password?: string,
): Promise<[string | undefined, PromiseVoid]> => {
    if (proxyUrl) {
        const url = new URL(proxyUrl);

        if (username || password) {
            url.username = username ?? '';
            url.password = password ?? '';
        }

        if (url.username || url.password) {
            const anonymized = await anonymizeProxy(url.href.slice(0, -1));

            return [
                anonymized,
                async () => {
                    await closeAnonymizedProxy(anonymized, true);
                },
            ];
        }

        return [
            undefined,
            async () => {},
        ];
    }

    return [
        undefined,
        async () => {},
    ];
};
