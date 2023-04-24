"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.anonymizeProxySugar = void 0;
const proxy_chain_1 = require("proxy-chain");
const anonymizeProxySugar = async (proxyUrl, username, password) => {
    if (proxyUrl) {
        const url = new URL(proxyUrl);
        if (username || password) {
            url.username = username ?? '';
            url.password = password ?? '';
        }
        if (url.username || url.password) {
            const anonymized = await (0, proxy_chain_1.anonymizeProxy)(url.href.slice(0, -1));
            return [
                anonymized,
                async () => {
                    await (0, proxy_chain_1.closeAnonymizedProxy)(anonymized, true);
                },
            ];
        }
        return [
            undefined,
            // eslint-disable-next-line @typescript-eslint/no-empty-function
            async () => { },
        ];
    }
    return [
        undefined,
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        async () => { },
    ];
};
exports.anonymizeProxySugar = anonymizeProxySugar;
//# sourceMappingURL=anonymize-proxy.js.map