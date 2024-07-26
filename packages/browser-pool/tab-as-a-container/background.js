'use strict';

/* eslint-disable no-undef */

const isFirefox = navigator.userAgent.includes('Firefox');

const webRequestPermissions = {
    blockingRequest: isFirefox ? ['blocking', 'requestHeaders'] : ['blocking', 'requestHeaders', 'extraHeaders'],
    blockingResponse: isFirefox ? ['blocking', 'responseHeaders'] : ['blocking', 'responseHeaders', 'extraHeaders'],
};

chrome.privacy.network.networkPredictionEnabled.set({ value: false });

const translator = new Map();
const counter = new Map();

const getOpenerId = (id) => {
    if (typeof id !== 'number' || !Number.isFinite(id)) {
        throw new Error('Expected `id` to be a number');
    }

    if (translator.has(id)) {
        const opener = translator.get(id);

        if (translator.has(opener)) {
            throw new Error('Opener is not the most ascendent');
        }

        // console.log(`getopener ${id} -> ${opener}`);
        return opener;
    }

    return id;
};

const keyFromTabId = (tabId) => `.${tabId}.`;

const getCookieURL = (cookie) => {
    const protocol = cookie.secure ? 'https:' : 'http:';
    const fixedDomain = cookie.domain[0] === '.' ? cookie.domain.slice(1) : cookie.domain;
    const url = `${protocol}//${fixedDomain}${cookie.path}`;

    return url;
};

// Rewrite cookies that were programmatically set to tabId instead of openerId.
// This is required because we cannot reliably get openerId inside Playwright.
chrome.cookies.onChanged.addListener(async (changeInfo) => {
    if (!changeInfo.removed) {
        const { cookie } = changeInfo;

        if (cookie.name[0] !== '.') {
            return;
        }

        const dotIndex = cookie.name.indexOf('.', 1);
        if (dotIndex === -1) {
            return;
        }

        const tabId = Number(cookie.name.slice(1, dotIndex));

        if (!Number.isFinite(tabId)) {
            return;
        }

        const realCookieName = cookie.name.slice(dotIndex + 1);
        const opener = getOpenerId(tabId);

        if (tabId !== opener) {
            // eslint-disable-next-line no-console
            console.log(`${realCookieName} -> ${keyFromTabId(opener)}`);

            await chrome.cookies.remove({
                name: cookie.name,
                url: getCookieURL(cookie),
                storeId: cookie.storeId,
            });

            delete cookie.hostOnly;
            delete cookie.session;

            await chrome.cookies.set({
                ...cookie,
                name: `${keyFromTabId(opener)}${realCookieName}`,
                url: getCookieURL(cookie),
            });
        }
    }
});

chrome.webRequest.onBeforeSendHeaders.addListener(
    (details) => {
        for (const header of details.requestHeaders) {
            if (header.name.toLowerCase() === 'cookie') {
                const id = keyFromTabId(getOpenerId(details.tabId));

                const fixedCookies = header.value
                    .split('; ')
                    .filter((x) => x.startsWith(id))
                    .map((x) => x.slice(id.length))
                    .join('; ');
                header.value = fixedCookies;
            }

            // Sometimes Chrome makes a request on a ghost tab.
            // We don't want these in order to prevent cluttering cookies.
            // Yes, `webNavigation.onCommitted` is emitted and `webNavigation.onCreatedNavigationTarget` is not.
            if (header.name.toLowerCase() === 'purpose' && header.value === 'prefetch' && !counter.has(details.tabId)) {
                // eslint-disable-next-line no-console
                console.log(details);
                return {
                    cancel: true,
                };
            }

            // This one is for Firefox
            if (header.name.toLowerCase() === 'x-moz' && header.value === 'prefetch' && !counter.has(details.tabId)) {
                // eslint-disable-next-line no-console
                console.log(details);
                return {
                    cancel: true,
                };
            }

            if (['beacon', 'csp_report', 'ping', 'speculative'].includes(details.type)) {
                // eslint-disable-next-line no-console
                console.log(details);
                return {
                    cancel: true,
                };
            }

            if (details.tabId === -1) {
                // eslint-disable-next-line no-console
                console.log(details);
            }
        }

        return {
            requestHeaders: details.requestHeaders.filter(
                (header) => header.name.toLowerCase() !== 'cookie' || header.value !== '',
            ),
        };
    },
    { urls: ['<all_urls>'] },
    webRequestPermissions.blockingRequest,
);

// Firefox Bug: doesn't catch https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy/report-uri
chrome.webRequest.onHeadersReceived.addListener(
    (details) => {
        for (const header of details.responseHeaders) {
            if (header.name.toLowerCase() === 'set-cookie') {
                const parts = header.value.split('\n');

                // `details.tabId` === -1 when Chrome is making internal requests, such downloading a service worker.

                const openerId = getOpenerId(details.tabId);

                header.value = parts
                    .map((part) => {
                        const equalsIndex = part.indexOf('=');
                        if (equalsIndex === -1) {
                            return `${keyFromTabId(openerId)}=${part.trimStart()}`;
                        }
                        return keyFromTabId(openerId) + part.trimStart();
                    })
                    .join('\n');
            }
        }

        return {
            responseHeaders: details.responseHeaders,
        };
    },
    { urls: ['<all_urls>'] },
    webRequestPermissions.blockingResponse,
);

chrome.tabs.onRemoved.addListener(async (tabId) => {
    const opener = getOpenerId(tabId);
    translator.delete(tabId);

    if (counter.has(opener)) {
        counter.set(opener, counter.get(opener) - 1);

        if (counter.get(opener) < 1) {
            counter.delete(opener);
        } else {
            return;
        }
    }

    const id = keyFromTabId(opener);

    chrome.cookies.getAll({}, async (cookies) => {
        await Promise.allSettled(
            cookies
                .filter((cookie) => cookie.name.startsWith(id))
                .map((cookie) => {
                    return chrome.cookies.remove({
                        name: cookie.name,
                        url: getCookieURL(cookie),
                        storeId: cookie.storeId,
                    });
                }),
        );
    });
});

// Proxy per tab
const getProxyConfiguration = (scheme, host, port) => {
    return {
        mode: 'fixed_servers',
        rules: {
            proxyForHttp: {
                scheme,
                host,
                port,
            },
            proxyForHttps: {
                scheme,
                host,
                port,
            },
        },
    };
};

const localhostIpCache = new Map();
const localHostIp = [127, 0, 0, 1];
const getNextLocalhostIp = (openerId) => {
    if (localhostIpCache.has(openerId)) {
        return localhostIpCache.get(openerId);
    }

    const result = localHostIp.join('.');

    localhostIpCache.set(openerId, result);

    if (localHostIp[3] === 254) {
        if (localHostIp[2] === 255) {
            if (localHostIp[1] === 255) {
                localHostIp[1] = 0;
            } else {
                localHostIp[1]++;
            }

            localHostIp[2] = 0;
        } else {
            localHostIp[2]++;
        }

        localHostIp[3] = 1;
    } else {
        localHostIp[3]++;
    }

    // [127.0.0.1 - 127.255.255.254] = 1 * 255 * 255 * 254 = 16 516 350
    while (localhostIpCache.length >= 1 * 255 * 255 * 254) {
        localhostIpCache.delete(localhostIpCache.keys().next().value);
    }

    return result;
};

let proxyPort;

// Clear extension's proxy settings on reload
if (isFirefox) {
    browser.proxy.settings.clear({});
} else {
    chrome.proxy.settings.clear({});
}

// Proxy per tab
if (isFirefox) {
    // On Firefox, we could use the `dns` permission to enforce DoH
    // but then the extension would not be compatible with Chrome.
    // Therefore users need to manually set the DNS settings.

    browser.proxy.onRequest.addListener(
        (details) => {
            const openerId = getOpenerId(details.tabId);

            if (typeof proxyPort === 'number') {
                return {
                    type: 'http',
                    host: getNextLocalhostIp(openerId),
                    port: proxyPort,
                };
            }
            return {
                type: 'direct',
            };
        },
        { urls: ['<all_urls>'] },
    );
} else {
    // The connection is not yet created with `onBeforeSendHeaders`, but is with `onSendHeaders`.
    chrome.webRequest.onBeforeSendHeaders.addListener(
        (details) => {
            const openerId = getOpenerId(details.tabId);

            if (typeof proxyPort === 'number') {
                chrome.proxy.settings.set({
                    value: getProxyConfiguration('http', getNextLocalhostIp(openerId), proxyPort),
                    scope: 'regular',
                });
            } else {
                chrome.proxy.settings.clear({});
            }
        },
        { urls: ['<all_urls>'] },
        webRequestPermissions.blockingRequest,
    );
}

// External communication. Note: the JSON keys are lowercased by the browser.
const routes = Object.assign(Object.create(null), {
    async tabid(details) {
        return { tabid: details.tabId, proxyip: getNextLocalhostIp(details.tabId) };
    },
    async proxy(details, body) {
        proxyPort = body.port;

        return '';
    },
});

const onCompleted = async (details) => {
    const textPlain = 'data:text/plain,';

    if (details.frameId === 0 && details.url.startsWith(textPlain)) {
        try {
            const url = new URL(details.url);
            const route = url.pathname.slice('text/plain,'.length);

            if (route in routes) {
                const hash = url.hash.slice(1);

                let body = {};

                if (hash !== '') {
                    try {
                        body = JSON.parse(decodeURIComponent(hash));
                    } catch {
                        // Empty on purpose.
                    }
                }

                // Different protocols are required, otherwise `onCompleted` won't be emitted.
                const result = await routes[route](details, body);
                if (result !== undefined) {
                    await chrome.tabs.update(details.tabId, {
                        url: `about:blank#${encodeURIComponent(JSON.stringify(result))}`,
                    });
                }
            }
        } catch {
            // Invalid URL, ignore.
        }
    }
};

chrome.webNavigation.onCompleted.addListener(onCompleted);

// Load content scripts.
(async () => {
    const contentResponse = await fetch(chrome.runtime.getURL('content.js'));
    const contentText = await contentResponse.text();

    // `tabs.onCreated` doesn't work here when manually creating new tabs,
    // because the opener is the current tab active.
    //
    // This events only fires when the page opens something.
    chrome.webNavigation.onCreatedNavigationTarget.addListener((details) => {
        translator.set(details.tabId, getOpenerId(details.sourceTabId));

        const opener = getOpenerId(details.tabId);

        if (counter.has(opener)) {
            counter.set(opener, counter.get(opener) + 1);
        } else {
            counter.set(opener, 2); // the current one + opener = 2
        }
    });

    chrome.webNavigation.onCommitted.addListener(async (details) => {
        if (details.url.startsWith('chrome')) {
            return;
        }

        const executeCodeInPageContext = `
        const script = document.createElement('script');
        script.textContent = code;

        const destination = document.head ?? document.documentElement;

        if (document instanceof HTMLDocument) {
            destination.append(script);
            script.remove();
        }
        `;

        // Race condition: website scripts may run first
        await chrome.tabs.executeScript(details.tabId, {
            code: `'use strict';
            (() => {
                if (window.totallyRandomString) {
                    return;
                }

                window.totallyRandomString = true;

                const code = "'use strict'; const tabId = '${getOpenerId(
                    details.tabId,
                )}'; (() => {\\n" + ${JSON.stringify(contentText)} + "\\n})();\\n";
                ${executeCodeInPageContext}
            })();
            `,
            matchAboutBlank: true,
            allFrames: true,
            runAt: 'document_start',
        });
    });

    chrome.tabs.query({}, async (tabs) => {
        for (const tab of tabs) {
            await onCompleted({
                frameId: 0,
                url: tab.url,
                tabId: tab.id,
            });
        }
    });
})();
