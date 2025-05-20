import fs from 'node:fs';

import type { Browser as PlaywrightBrowser, BrowserType } from 'playwright';

import { BrowserPlugin } from '../abstract-classes/browser-plugin.js';
import { anonymizeProxySugar } from '../anonymize-proxy.js';
import type { createProxyServerForContainers } from '../container-proxy-server.js';
import type { LaunchContext } from '../launch-context.js';
import { log } from '../logger.js';
import { getLocalProxyAddress } from '../proxy-server.js';
import type { SafeParameters } from '../utils.js';
import { PlaywrightBrowser as PlaywrightBrowserWithPersistentContext } from './playwright-browser.js';
import { PlaywrightController } from './playwright-controller.js';

export class PlaywrightPlugin extends BrowserPlugin<
    BrowserType,
    SafeParameters<BrowserType['launch']>[0],
    PlaywrightBrowser
> {
    private _browserVersion?: string;
    _containerProxyServer?: Awaited<ReturnType<typeof createProxyServerForContainers>>;

    protected async _launch(launchContext: LaunchContext<BrowserType>): Promise<PlaywrightBrowser> {
        const { launchOptions, useIncognitoPages, userDataDir, proxyUrl } = launchContext;
        let browser: PlaywrightBrowser;

        // Required for the `proxy` context option to work.
        launchOptions!.proxy = {
            server: await getLocalProxyAddress(),
            ...launchOptions!.proxy,
        };

        // WebKit does not support --no-sandbox
        if (this.library.name() === 'webkit') {
            launchOptions!.args = launchOptions!.args?.filter((arg) => arg !== '--no-sandbox');
        }

        const [anonymizedProxyUrl, close] = await anonymizeProxySugar(proxyUrl);
        if (anonymizedProxyUrl) {
            launchOptions!.proxy = {
                server: anonymizedProxyUrl,
                bypass: launchOptions!.proxy.bypass,
            };
        }

        try {
            if (useIncognitoPages) {
                browser = await this.library.launch(launchOptions).catch((error) => {
                    return this._throwOnFailedLaunch(launchContext, error);
                });

                if (anonymizedProxyUrl) {
                    browser.on('disconnected', async () => {
                        await close();
                    });
                }
            } else {
                const browserContext = await this.library
                    .launchPersistentContext(userDataDir, launchOptions)
                    .catch((error) => {
                        return this._throwOnFailedLaunch(launchContext, error);
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

                if (!this._browserVersion) {
                    // Launches unused browser just to get the browser version.
                    const inactiveBrowser = await this.library.launch(launchOptions);
                    this._browserVersion = inactiveBrowser.version();

                    inactiveBrowser.close().catch((error) => {
                        log.exception(error, 'Failed to close browser.');
                    });
                }

                browser = new PlaywrightBrowserWithPersistentContext({
                    browserContext,
                    version: this._browserVersion,
                }) as unknown as PlaywrightBrowser;
            }
        } catch (error) {
            await close();

            throw error;
        }

        return browser;
    }

    private _throwOnFailedLaunch(launchContext: LaunchContext<BrowserType>, cause: unknown): never {
        this._throwAugmentedLaunchError(
            cause,
            launchContext.launchOptions?.executablePath,
            '`apify/actor-node-playwright-*` (with a correct browser name)',
            'Try installing the required dependencies by running `npx playwright install --with-deps` (https://playwright.dev/docs/browsers).',
        );
    }

    override createController(): PlaywrightController {
        return new PlaywrightController(this as any);
    }

    protected async _addProxyToLaunchOptions(launchContext: LaunchContext<BrowserType>): Promise<void> {
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

    protected _isChromiumBasedBrowser(): boolean {
        const name = this.library.name();
        return name === 'chromium';
    }
}
