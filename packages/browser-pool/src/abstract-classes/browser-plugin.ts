import { type CrawleeLogger, CriticalError, serviceLocator } from '@crawlee/core';
import type { Dictionary } from '@crawlee/types';
import merge from 'lodash.merge';

import type { LaunchContextOptions } from '../launch-context.js';
import { LaunchContext } from '../launch-context.js';
import { RemoteBrowserProvider } from '../remote-browser-provider.js';
import type { UnwrapPromise } from '../utils.js';
import type { BrowserController } from './browser-controller.js';

/**
 * The default User Agent used by `PlaywrightCrawler`, `launchPlaywright`, 'PuppeteerCrawler' and 'launchPuppeteer'
 * when Chromium/Chrome browser is launched:
 *  - in headless mode,
 *  - without using a fingerprint,
 *  - without specifying a user agent.
 * Last updated on 2022-05-05.
 *
 * After you update it here, please update it also in jsdom-crawler.ts
 */
export const DEFAULT_USER_AGENT =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/107.0.0.0 Safari/537.36';

/**
 * Each plugin expects an instance of the object with the `.launch()` property.
 * For Puppeteer, it is the `puppeteer` module itself, whereas for Playwright
 * it is one of the browser types, such as `puppeteer.chromium`.
 * `BrowserPlugin` does not include the library. You can choose any version
 * or fork of the library. It also keeps `browser-pool` installation small.
 */
export interface CommonLibrary {
    product?: string;
    launch(opts?: Dictionary): Promise<CommonBrowser>;
    name?: () => string;
}

/** @internal */
export interface CommonBrowser {
    newPage(...args: unknown[]): Promise<CommonPage>;
}

/** @internal */
export interface CommonPage {
    close(...args: unknown[]): Promise<unknown>;
    url(): string | Promise<string>;
}

/**
 * Return type for dynamic endpoint functions that need to pass session
 * metadata to the `release()` callback.
 */
export interface RemoteBrowserEndpointResult {
    /** The browser endpoint URL to connect to. */
    url: string;
    /** Opaque metadata passed back to `release()` — e.g. session IDs, API tokens. */
    context?: Record<string, unknown>;
}

/**
 * Configuration for connecting to a remote browser service.
 *
 * **Static endpoint (e.g. Browserless):**
 * ```typescript
 * { endpoint: 'wss://browserless.io?token=xxx' }
 * ```
 *
 * **Dynamic endpoint with lifecycle (e.g. Browserbase):**
 * ```typescript
 * {
 *     endpoint: async () => {
 *         const session = await createSession();
 *         return { url: session.connectUrl, context: { id: session.id } };
 *     },
 *     release: async ({ context }) => {
 *         await releaseSession(context.id);
 *     },
 * }
 * ```
 */
export interface RemoteBrowserConfig {
    /**
     * The browser endpoint URL, or an async function that returns one.
     * When a function is provided, it is called once per browser launch (not per page).
     *
     * Can return a plain string or an object with `url` and optional `context`
     * that will be forwarded to `release()`.
     */
    endpoint: string | (() => string | RemoteBrowserEndpointResult | Promise<string | RemoteBrowserEndpointResult>);
    /**
     * Optional cleanup function called when the browser closes, crashes, or the pool is destroyed.
     * Receives the resolved endpoint URL and the `context` object returned by `endpoint()`.
     * Errors are caught and logged as warnings — they never crash the crawler.
     */
    release?: (info: { endpoint: string; context?: Record<string, unknown> }) => void | Promise<void>;
    /**
     * Connection type. Subclass interfaces narrow this further
     * (e.g. Puppeteer only allows `'cdp'`).
     * @default 'cdp'
     */
    type?: 'cdp' | 'websocket';
    /**
     * Maximum number of browsers that can be open at the same time.
     * When the limit is reached, the crawler waits for a browser to close before launching a new one.
     * Set this to your remote service's concurrent session limit to avoid 429 errors.
     */
    maxOpenBrowsers?: number;
}

export interface BrowserPluginOptions<LibraryOptions> {
    /**
     * Options that will be passed down to the automation library. E.g.
     * `puppeteer.launch(launchOptions);`. This is a good place to set
     * options that you want to apply as defaults. To dynamically override
     * those options per-browser, see the `preLaunchHooks` of {@apilink BrowserPool}.
     */
    launchOptions?: LibraryOptions;
    /**
     * Automation libraries configure proxies differently. This helper allows you
     * to set a proxy URL without worrying about specific implementations.
     * It also allows you use an authenticated proxy without extra code.
     */
    proxyUrl?: string;
    /**
     * By default pages share the same browser context.
     * If set to true each page uses its own context that is destroyed once the page is closed or crashes.
     *
     * @default false
     */
    useIncognitoPages?: boolean;
    /**
     * Path to a User Data Directory, which stores browser session data like cookies and local storage.
     */
    userDataDir?: string;
    /**
     * If set to `true`, the crawler respects the proxy url generated for the given request.
     * This aligns the browser-based crawlers with the `HttpCrawler`.
     *
     * Might cause performance issues, as Crawlee might launch too many browser instances.
     */
    browserPerProxy?: boolean;
    /**
     * If set to `true`, TLS certificate errors from the upstream proxy will be ignored.
     * This is useful when using HTTPS proxies with self-signed certificates.
     */
    ignoreProxyCertificate?: boolean;
    /**
     * Configuration for connecting to a remote browser service.
     * When set, the plugin connects to a remote browser instead of launching a local one.
     *
     * Accepts either a {@link RemoteBrowserConfig} object or a {@link RemoteBrowserProvider} instance.
     *
     * Takes precedence over `connectOverCDPOptions` / `connectOptions` if both are set.
     */
    remoteBrowser?: RemoteBrowserConfig | RemoteBrowserProvider<any>;
}

export interface CreateLaunchContextOptions<
    Library extends CommonLibrary,
    LibraryOptions extends Dictionary | undefined = Parameters<Library['launch']>[0],
    LaunchResult extends CommonBrowser = UnwrapPromise<ReturnType<Library['launch']>>,
    NewPageOptions = Parameters<LaunchResult['newPage']>[0],
    NewPageResult = UnwrapPromise<ReturnType<LaunchResult['newPage']>>,
> extends Partial<
    Omit<LaunchContextOptions<Library, LibraryOptions, LaunchResult, NewPageOptions, NewPageResult>, 'browserPlugin'>
> {}

/**
 * The `BrowserPlugin` serves two purposes. First, it is the base class that
 * specialized controllers like `PuppeteerPlugin` or `PlaywrightPlugin` extend.
 * Second, it allows the user to configure the automation libraries and
 * feed them to {@apilink BrowserPool} for use.
 */
export abstract class BrowserPlugin<
    Library extends CommonLibrary = CommonLibrary,
    LibraryOptions extends Dictionary | undefined = Parameters<Library['launch']>[0],
    LaunchResult extends CommonBrowser = UnwrapPromise<ReturnType<Library['launch']>>,
    NewPageOptions = Parameters<LaunchResult['newPage']>[0],
    NewPageResult = UnwrapPromise<ReturnType<LaunchResult['newPage']>>,
> {
    name = this.constructor.name;
    protected log!: CrawleeLogger;
    library: Library;
    launchOptions: LibraryOptions;
    proxyUrl?: string;
    userDataDir?: string;
    useIncognitoPages: boolean;
    browserPerProxy?: boolean;

    ignoreProxyCertificate?: boolean;
    remoteBrowser?: RemoteBrowserConfig;

    constructor(library: Library, options: BrowserPluginOptions<LibraryOptions> = {}) {
        const {
            launchOptions = {} as LibraryOptions,
            proxyUrl,
            userDataDir,
            useIncognitoPages = false,
            browserPerProxy = false,
            ignoreProxyCertificate = false,
            remoteBrowser,
        } = options;

        this.log = serviceLocator.getLogger().child({ prefix: 'BrowserPool' });
        this.library = library;
        this.launchOptions = launchOptions;
        this.proxyUrl = proxyUrl && new URL(proxyUrl).href.slice(0, -1);
        this.userDataDir = userDataDir;
        this.useIncognitoPages = useIncognitoPages;
        this.browserPerProxy = browserPerProxy;
        this.ignoreProxyCertificate = ignoreProxyCertificate;

        // Normalize RemoteBrowserProvider instances into a plain RemoteBrowserConfig
        // so all downstream code only deals with the config shape.
        if (remoteBrowser instanceof RemoteBrowserProvider) {
            const provider = remoteBrowser;
            this.remoteBrowser = {
                endpoint: () => provider.connect(),
                release: ({ context }) => provider.release(context as any),
                type: provider.type,
                maxOpenBrowsers: provider.maxOpenBrowsers,
            };
        } else {
            this.remoteBrowser = remoteBrowser;
        }
    }

    /** Resolves the remote browser endpoint from a string or function. Returns { url, context }. */
    protected async _resolveRemoteEndpoint(): Promise<RemoteBrowserEndpointResult> {
        const { endpoint } = this.remoteBrowser!;
        const result = typeof endpoint === 'function' ? await endpoint() : endpoint;
        if (typeof result === 'string') {
            return { url: result };
        }
        return result;
    }

    /** @internal Called by BrowserController on browser close/kill. */
    async _callRelease(endpoint: string, context?: Record<string, unknown>): Promise<void> {
        try {
            await this.remoteBrowser?.release?.({ endpoint, context });
        } catch (err) {
            this.log.warning('remoteBrowser.release() failed.', { error: (err as Error)?.message });
        }
    }

    /** Strips credentials from a URL for safe logging. */
    protected _sanitizeEndpointForLog(endpoint: string): string {
        try {
            const url = new URL(endpoint);
            if (url.username || url.password) {
                url.username = '***';
                url.password = '***';
            }
            return url.toString();
        } catch {
            return '<invalid URL>';
        }
    }

    /**
     * Creates a `LaunchContext` with all the information needed
     * to launch a browser. Aside from library specific launch options,
     * it also includes internal properties used by `BrowserPool` for
     * management of the pool and extra features.
     */
    createLaunchContext(
        options: CreateLaunchContextOptions<Library, LibraryOptions, LaunchResult, NewPageOptions, NewPageResult> = {},
    ): LaunchContext<Library, LibraryOptions, LaunchResult, NewPageOptions, NewPageResult> {
        const {
            id,
            launchOptions = {},
            proxyUrl = this.proxyUrl,
            useIncognitoPages = this.useIncognitoPages,
            userDataDir = this.userDataDir,
            browserPerProxy = this.browserPerProxy,
            ignoreProxyCertificate = this.ignoreProxyCertificate,
            isRemote,
        } = options;

        return new LaunchContext({
            id,
            launchOptions: merge({}, this.launchOptions, launchOptions),
            browserPlugin: this,
            proxyUrl,
            useIncognitoPages,
            userDataDir,
            browserPerProxy,
            ignoreProxyCertificate,
            isRemote,
        });
    }

    abstract createController(): BrowserController<
        Library,
        LibraryOptions,
        LaunchResult,
        NewPageOptions,
        NewPageResult
    >;

    /**
     * Launches the browser using provided launch context.
     */
    async launch(
        launchContext: LaunchContext<
            Library,
            LibraryOptions,
            LaunchResult,
            NewPageOptions,
            NewPageResult
        > = this.createLaunchContext(),
    ): Promise<LaunchResult> {
        // launchOptions is only used by the local launch path below — remote connections ignore it.
        launchContext.launchOptions ??= {} as LibraryOptions;

        const { proxyUrl, launchOptions } = launchContext;

        if (proxyUrl && launchContext.isRemote) {
            this.log.warning(
                'proxyUrl is set but will be ignored for remote browser connections. ' +
                    'Configure proxy settings on the remote browser service instead.',
            );
        }

        if (proxyUrl && !launchContext.isRemote) {
            await this._addProxyToLaunchOptions(launchContext);
        }

        if (!launchContext.isRemote && this._isChromiumBasedBrowser(launchContext)) {
            // This will set the args for chromium based browsers to hide the webdriver.
            (launchOptions as Dictionary).args = this._mergeArgsToHideWebdriver(launchOptions!.args);
            // When User-Agent is not set, and we're using Chromium in headless mode,
            // it is better to use DEFAULT_USER_AGENT to reduce chance of detection,
            // as otherwise 'HeadlessChrome' is present in User-Agent string.
            const userAgent = launchOptions!.args.find((arg: string) => arg.startsWith('--user-agent'));
            if (launchOptions!.headless && !launchContext.fingerprint && !userAgent) {
                launchOptions!.args.push(`--user-agent=${DEFAULT_USER_AGENT}`);
            }
        }

        if (launchContext.isRemote) {
            this.log.info('Connecting to remote browser (skipping local proxy and webdriver stealth configuration).');
        }

        return this._launch(launchContext);
    }

    private _mergeArgsToHideWebdriver(originalArgs?: string[]): string[] {
        if (!originalArgs?.length) {
            return ['--disable-blink-features=AutomationControlled'];
        }

        const argumentIndex = originalArgs.findIndex((arg: string) => arg.startsWith('--disable-blink-features='));

        if (argumentIndex !== -1) {
            originalArgs[argumentIndex] += ',AutomationControlled';
        } else {
            originalArgs.push('--disable-blink-features=AutomationControlled');
        }

        return originalArgs;
    }

    protected _throwAugmentedLaunchError(
        cause: unknown,
        executablePath: string | undefined,
        dockerImage: string,
        moduleInstallCommand: string,
    ): never {
        const errorMessage = ['Failed to launch browser. Please check the following:'];

        if (executablePath) {
            errorMessage.push(`- Check whether the provided executable path "${executablePath}" is correct.`);
        }

        if (process.env.APIFY_IS_AT_HOME) {
            errorMessage.push(`- Make sure your Dockerfile extends ${dockerImage}.`);
        }

        errorMessage.push(`- ${moduleInstallCommand}`);

        errorMessage.push(
            '',
            'The original error is available in the `cause` property. Below is the error received when trying to launch a browser:',
            '',
        );

        // Add in a zero-width space so we can remove it later when printing the error stack
        throw new BrowserLaunchError(`${errorMessage.join('\n')}\u200b`, { cause });
    }

    /**
     * @private
     */
    protected abstract _addProxyToLaunchOptions(
        launchContext: LaunchContext<Library, LibraryOptions, LaunchResult, NewPageOptions, NewPageResult>,
    ): Promise<void>;

    protected abstract _isChromiumBasedBrowser(
        launchContext: LaunchContext<Library, LibraryOptions, LaunchResult, NewPageOptions, NewPageResult>,
    ): boolean;

    /**
     * @private
     */
    protected abstract _launch(
        launchContext: LaunchContext<Library, LibraryOptions, LaunchResult, NewPageOptions, NewPageResult>,
    ): Promise<LaunchResult>;
}

export class BrowserLaunchError extends CriticalError {
    public constructor(...args: ConstructorParameters<typeof CriticalError>) {
        super(...args);
        this.name = 'BrowserLaunchError';

        const [, oldStack] = this.stack?.split('\u200b') ?? [null, ''];

        Object.defineProperty(this, 'stack', {
            get: () => {
                if (this.cause instanceof Error) {
                    return `${this.message}\n${this.cause.stack}\nError thrown at:\n${oldStack}`;
                }

                return `${this.message}\n${oldStack}`;
            },
        });
    }
}
