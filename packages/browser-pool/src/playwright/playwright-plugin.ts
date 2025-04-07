import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

import type { Browser as PlaywrightBrowser, BrowserType } from 'playwright';

import type { BrowserController } from '../abstract-classes/browser-controller';
import { BrowserPlugin } from '../abstract-classes/browser-plugin';
import { anonymizeProxySugar } from '../anonymize-proxy';
import { createProxyServerForContainers } from '../container-proxy-server';
import type { LaunchContext } from '../launch-context';
import { log } from '../logger';
import { getLocalProxyAddress } from '../proxy-server';
import type { SafeParameters } from '../utils';
import { loadFirefoxAddon } from './load-firefox-addon';
import { PlaywrightBrowser as PlaywrightBrowserWithPersistentContext } from './playwright-browser';
import { PlaywrightController } from './playwright-controller';

const getFreePort = async () => {
    return new Promise<number>((resolve, reject) => {
        const server = net
            .createServer()
            .once('error', reject)
            .listen(() => {
                resolve((server.address() as net.AddressInfo).port);
                server.close();
            });
    });
};

// __dirname = browser-pool/dist/playwright
//  taacPath = browser-pool/dist/tab-as-a-container
const taacPath = path.join(__dirname, '..', 'tab-as-a-container');

export class PlaywrightPlugin extends BrowserPlugin<
    BrowserType,
    SafeParameters<BrowserType['launch']>[0],
    PlaywrightBrowser
> {
    private _browserVersion?: string;
    _containerProxyServer?: Awaited<ReturnType<typeof createProxyServerForContainers>>;

    protected async _launch(launchContext: LaunchContext<BrowserType>): Promise<PlaywrightBrowser> {
        const { launchOptions, useIncognitoPages, proxyUrl } = launchContext;

        let { userDataDir } = launchContext;

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
                const experimentalContainers = launchContext.experimentalContainers && this.library.name() !== 'webkit';
                let firefoxPort: number | undefined;

                if (experimentalContainers) {
                    launchOptions!.args = [...(launchOptions!.args ?? [])];

                    // Use native headless mode so we can load an extension
                    if (launchOptions!.headless && this.library.name() === 'chromium') {
                        launchOptions!.args.push('--headless=chrome');
                    }

                    if (this.library.name() === 'chromium') {
                        launchOptions!.args.push(
                            `--disable-extensions-except=${taacPath}`,
                            `--load-extension=${taacPath}`,
                        );
                    } else if (this.library.name() === 'firefox') {
                        firefoxPort = await getFreePort();

                        launchOptions!.args.push(`--start-debugger-server=${firefoxPort}`);

                        const prefs = {
                            'devtools.debugger.remote-enabled': true,
                            'devtools.debugger.prompt-connection': false,
                        };

                        const prefsRaw = Object.entries(prefs)
                            .map(([name, value]) => `user_pref(${JSON.stringify(name)}, ${JSON.stringify(value)});`)
                            .join('\n');

                        if (userDataDir === '') {
                            userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'apify-playwright-firefox-taac-'));
                        }

                        fs.writeFileSync(path.join(userDataDir, 'user.js'), prefsRaw);
                    }
                }

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

                if (experimentalContainers) {
                    if (this.library.name() === 'firefox') {
                        const loaded = await loadFirefoxAddon(firefoxPort!, '127.0.0.1', taacPath);

                        if (!loaded) {
                            await browserContext.close();
                            throw new Error('Failed to load Firefox experimental containers addon');
                        }
                    }

                    // Wait for the extension to load.
                    const checker = await browserContext.newPage();
                    await checker.goto('data:text/plain,tabid');
                    await checker.waitForNavigation();
                    await checker.close();

                    this._containerProxyServer = await createProxyServerForContainers();

                    const page = await browserContext.newPage();
                    await page.goto(`data:text/plain,proxy#{"port":${this._containerProxyServer.port}}`);
                    await page.waitForNavigation();
                    await page.close();

                    browserContext.on('close', async () => {
                        await this._containerProxyServer!.close(true);
                    });
                }

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

    protected _createController(): BrowserController<
        BrowserType,
        SafeParameters<BrowserType['launch']>[0],
        PlaywrightBrowser
    > {
        return new PlaywrightController(this);
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
