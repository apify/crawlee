import fs from 'node:fs';
import { BrowserPlugin } from '../abstract-classes/browser-plugin.js';
import { anonymizeProxySugar } from '../anonymize-proxy.js';
import { getLocalProxyAddress } from '../proxy-server.js';
import { PlaywrightBrowser as PlaywrightBrowserWithPersistentContext } from './playwright-browser.js';
import { PlaywrightController } from './playwright-controller.js';
export class PlaywrightPlugin extends BrowserPlugin {
    #browserVersion;
    /**
     * Playwright remote connections only support incognito pages — `connect()` / `connectOverCDP()` don't
     * accept persistent contexts. Force it on (and inform the user) when wired for a remote connection.
     */
    useRemoteConnection(connection, parameters = {}) {
        super.useRemoteConnection(connection, parameters);
        if (!this.useIncognitoPages) {
            this.log.info('Remote Playwright connection — useIncognitoPages forced to true. ' +
                'Pages will not share cookies/storage between each other; use the SessionPool for shared state.');
        }
        this.useIncognitoPages = true;
    }
    async _launch(launchContext) {
        if (this.remoteConnection) {
            return this.connectToRemoteBrowser(launchContext, async (url) => {
                const connectOptions = (this.remoteConnectionParameters?.connectOptions ?? {});
                if (this.remoteConnectionParameters?.protocol === 'playwright') {
                    this.log.info('Connecting to remote browser via connect (Playwright WebSocket).');
                    return this.library.connect(url, connectOptions);
                }
                this.log.info('Connecting to remote browser via connectOverCDP.');
                return this.library.connectOverCDP(url, connectOptions);
            });
        }
        const { launchOptions, useIncognitoPages, userDataDir, proxyUrl } = launchContext;
        let browser;
        // Required for the `proxy` context option to work.
        launchOptions.proxy = {
            server: await getLocalProxyAddress(),
            ...launchOptions.proxy,
        };
        // WebKit does not support --no-sandbox
        if (this.library.name() === 'webkit') {
            launchOptions.args = launchOptions.args?.filter((arg) => arg !== '--no-sandbox');
        }
        const [anonymizedProxyUrl, close] = await anonymizeProxySugar(proxyUrl, undefined, undefined, {
            ignoreProxyCertificate: launchContext.ignoreProxyCertificate,
        });
        if (anonymizedProxyUrl) {
            launchOptions.proxy = {
                server: anonymizedProxyUrl,
                bypass: launchOptions.proxy.bypass,
            };
        }
        try {
            if (useIncognitoPages) {
                browser = await this.library.launch(launchOptions).catch((error) => {
                    return this.throwOnFailedLaunch(launchContext, error);
                });
                if (anonymizedProxyUrl) {
                    browser.on('disconnected', async () => {
                        await close();
                    });
                }
            }
            else {
                const browserContext = await this.library
                    .launchPersistentContext(userDataDir, launchOptions)
                    .catch((error) => {
                    return this.throwOnFailedLaunch(launchContext, error);
                });
                browserContext.once('close', () => {
                    if (userDataDir.includes('apify-playwright-firefox-taac-')) {
                        fs.rmSync(userDataDir, {
                            recursive: true,
                            force: true,
                        });
                    }
                });
                if (anonymizedProxyUrl) {
                    browserContext.on('close', async () => {
                        await close();
                    });
                }
                if (!this.#browserVersion) {
                    // Launches unused browser just to get the browser version.
                    const inactiveBrowser = await this.library.launch(launchOptions);
                    this.#browserVersion = inactiveBrowser.version();
                    inactiveBrowser.close().catch((error) => {
                        this.log.exception(error, 'Failed to close browser.');
                    });
                }
                const persistentBrowser = new PlaywrightBrowserWithPersistentContext({
                    browserContext,
                    version: this.#browserVersion,
                });
                persistentBrowser.setBrowserType(this.library);
                browser = persistentBrowser;
            }
        }
        catch (error) {
            await close();
            throw error;
        }
        return browser;
    }
    throwOnFailedLaunch(launchContext, cause) {
        this.throwAugmentedLaunchError(cause, launchContext.launchOptions?.executablePath, '`apify/actor-node-playwright-*` (with a correct browser name)', 'Try installing the required dependencies by running `npx playwright install --with-deps` (https://playwright.dev/docs/browsers).');
    }
    createController() {
        return new PlaywrightController(this);
    }
    async addProxyToLaunchOptions(launchContext) {
        launchContext.launchOptions ??= {};
        const { launchOptions, proxyUrl } = launchContext;
        if (proxyUrl) {
            const url = new URL(proxyUrl);
            launchOptions.proxy = {
                server: url.origin,
                username: decodeURIComponent(url.username),
                password: decodeURIComponent(url.password),
            };
        }
    }
    isChromiumBasedBrowser() {
        const name = this.library.name();
        return name === 'chromium';
    }
}
