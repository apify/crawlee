import type { Dictionary } from '@crawlee/types';
import { lazyImport } from '@crawlee/utils';
import type owType from 'ow';

const ow = lazyImport<typeof owType>(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, global-require
    const m = require('ow');
    return m.default ?? m;
});

/** @internal */
export const validators = {
    // Naming it browser page for future proofing with Playwright
    browserPage: (value: Dictionary) => ({
        validator: ow.isValid(value, ow.object.hasKeys('goto', 'evaluate', '$', 'on')),
        message: (label: string) => `Expected argument '${label}' to be a Puppeteer Page, got something else.`,
    }),
    proxyConfiguration: (value: Dictionary) => ({
        validator: ow.isValid(value, ow.object.hasKeys('newUrl', 'newProxyInfo')),
        message: (label: string) => `Expected argument '${label}' to be a ProxyConfiguration, got something else.`,
    }),
    requestList: (value: Dictionary) => ({
        validator: ow.isValid(value, ow.object.hasKeys('fetchNextRequest', 'persistState')),
        message: (label: string) => `Expected argument '${label}' to be a RequestList, got something else.`,
    }),
    requestQueue: (value: Dictionary) => ({
        validator: ow.isValid(value, ow.object.hasKeys('fetchNextRequest', 'addRequest')),
        message: (label: string) => `Expected argument '${label}' to be a RequestQueue, got something else.`,
    }),
};
