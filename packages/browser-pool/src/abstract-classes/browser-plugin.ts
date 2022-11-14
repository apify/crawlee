import merge from 'lodash.merge';
import type { Dictionary } from '@crawlee/types';
import type { LaunchContextOptions } from '../launch-context';
import { LaunchContext } from '../launch-context';
import type { BrowserController } from './browser-controller';
import { throwImplementationNeeded } from './utils';
import type { UnwrapPromise } from '../utils';

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
export const DEFAULT_USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/107.0.0.0 Safari/537.36';

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
     * @experimental
     * Like `useIncognitoPages`, but for persistent contexts, so cache is used for faster loading.
     * Works best with Firefox. Unstable on Chromium.
     */
    experimentalContainers?: boolean;
    /**
     * Path to a User Data Directory, which stores browser session data like cookies and local storage.
     */
    userDataDir?: string;
}

export interface CreateLaunchContextOptions<
    Library extends CommonLibrary,
    LibraryOptions extends Dictionary | undefined = Parameters<Library['launch']>[0],
    LaunchResult extends CommonBrowser = UnwrapPromise<ReturnType<Library['launch']>>,
    NewPageOptions = Parameters<LaunchResult['newPage']>[0],
    NewPageResult = UnwrapPromise<ReturnType<LaunchResult['newPage']>>,
> extends Partial<Omit<LaunchContextOptions<Library, LibraryOptions, LaunchResult, NewPageOptions, NewPageResult>, 'browserPlugin'>> {}

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

    library: Library;

    launchOptions: LibraryOptions;

    proxyUrl?: string;

    userDataDir?: string;

    useIncognitoPages: boolean;

    experimentalContainers: boolean;

    constructor(library: Library, options: BrowserPluginOptions<LibraryOptions> = {}) {
        const {
            launchOptions = {} as LibraryOptions,
            proxyUrl,
            userDataDir,
            useIncognitoPages = false,
            experimentalContainers = false,
        } = options;

        this.library = library;
        this.launchOptions = launchOptions;
        this.proxyUrl = proxyUrl && new URL(proxyUrl).href.slice(0, -1);
        this.userDataDir = userDataDir;
        this.useIncognitoPages = useIncognitoPages;
        this.experimentalContainers = experimentalContainers;
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
            experimentalContainers = this.experimentalContainers,
        } = options;

        return new LaunchContext({
            id,
            launchOptions: merge({}, this.launchOptions, launchOptions),
            browserPlugin: this,
            proxyUrl,
            useIncognitoPages,
            experimentalContainers,
            userDataDir,
        });
    }

    createController(): BrowserController<Library, LibraryOptions, LaunchResult, NewPageOptions, NewPageResult> {
        return this._createController();
    }

    /**
     * Launches the browser using provided launch context.
     */
    async launch(
        launchContext: LaunchContext<Library, LibraryOptions, LaunchResult, NewPageOptions, NewPageResult> = this.createLaunchContext(),
    ): Promise<LaunchResult> {
        launchContext.launchOptions ??= {} as LibraryOptions;

        const { proxyUrl, launchOptions } = launchContext;

        if (proxyUrl) {
            await this._addProxyToLaunchOptions(launchContext);
        }

        if (this._isChromiumBasedBrowser(launchContext)) {
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
    };

    /**
     * @private
     */
    // @ts-expect-error Give runtime error as well as compile time
    // eslint-disable-next-line max-len
    protected abstract _addProxyToLaunchOptions(launchContext: LaunchContext<Library, LibraryOptions, LaunchResult, NewPageOptions, NewPageResult>): Promise<void> {
        throwImplementationNeeded('_addProxyToLaunchOptions');
    }

    // @ts-expect-error Give runtime error as well as compile time
    // eslint-disable-next-line space-before-function-paren, @typescript-eslint/no-unused-vars, max-len
    protected abstract _isChromiumBasedBrowser(launchContext: LaunchContext<Library, LibraryOptions, LaunchResult, NewPageOptions, NewPageResult>): boolean {
        throwImplementationNeeded('_isChromiumBasedBrowser');
    }

    /**
     * @private
     */
    // @ts-expect-error Give runtime error as well as compile time
    protected abstract _launch(launchContext: LaunchContext<Library, LibraryOptions, LaunchResult, NewPageOptions, NewPageResult>): Promise<LaunchResult> {
        throwImplementationNeeded('_launch');
    }

    /**
     * @private
     */
    // @ts-expect-error Give runtime error as well as compile time
    // eslint-disable-next-line space-before-function-paren
    protected abstract _createController(): BrowserController<Library, LibraryOptions, LaunchResult, NewPageOptions, NewPageResult> {
        throwImplementationNeeded('_createController');
    }
}
