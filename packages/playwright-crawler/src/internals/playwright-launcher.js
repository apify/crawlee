import { BrowserLauncher, Configuration } from '@crawlee/browser';
import { PlaywrightPlugin } from '@crawlee/browser-pool';
import { parseArgument, schemas } from '@crawlee/utils/internal';
import { z } from 'zod';
/**
 * `PlaywrightLauncher` is based on the `BrowserLauncher`. It launches `playwright` browser instance.
 * @ignore
 */
export class PlaywrightLauncher extends BrowserLauncher {
    configuration;
    /**
     * @internal
     */
    static optionsShape = {
        ...BrowserLauncher.optionsShape,
        // Passthrough schemas — the launcher module object must keep its prototype through parsing.
        launcher: schemas.anyObject.optional(),
        launchContextOptions: schemas.anyObject.optional(),
    };
    /** @internal */
    static optionsSchema = z.strictObject(PlaywrightLauncher.optionsShape);
    /**
     * All `PlaywrightLauncher` parameters are passed via this launchContext object.
     */
    constructor(launchContext = {}, configuration = Configuration.getGlobalConfiguration()) {
        const parsedContext = parseArgument(launchContext, PlaywrightLauncher.optionsSchema, 'PlaywrightLaunchContext');
        const { launcher = BrowserLauncher.requireLauncherOrThrow('playwright', 'apify/actor-node-playwright-*').chromium, } = parsedContext;
        const { launchOptions = {}, ...rest } = parsedContext;
        super({
            ...rest,
            launchOptions: {
                ...launchOptions,
                executablePath: getDefaultExecutablePath(parsedContext, configuration),
            },
            launcher,
        }, configuration);
        this.configuration = configuration;
        this.Plugin = PlaywrightPlugin;
    }
}
/**
 * If actor-node-playwright-* image is used the CRAWLEE_DEFAULT_BROWSER_PATH is considered as default.
 * @returns default path to browser.
 * @ignore
 */
function getDefaultExecutablePath(launchContext, configuration) {
    const pathFromPlaywrightImage = configuration.defaultBrowserPath;
    const { launchOptions = {} } = launchContext;
    if (launchOptions.executablePath) {
        return launchOptions.executablePath;
    }
    if (launchContext.useChrome) {
        return undefined;
    }
    if (pathFromPlaywrightImage) {
        return pathFromPlaywrightImage;
    }
    return undefined;
}
/**
 * Launches headless browsers using Playwright pre-configured to work within the Apify platform.
 * The function has the same return value as `browserType.launch()`.
 * See [Playwright documentation](https://playwright.dev/docs/api/class-browsertype) for more details.
 *
 * The `launchPlaywright()` function alters the following Playwright options:
 *
 * - Passes the setting from the `CRAWLEE_HEADLESS` environment variable to the `headless` option,
 *   unless it was already defined by the caller or `CRAWLEE_XVFB` environment variable is set to `1`.
 *   Note that Apify Actor cloud platform automatically sets `CRAWLEE_HEADLESS=1` to all running actors.
 * - Takes the `proxyUrl` option, validates it and adds it to `launchOptions` in a proper format.
 *   The proxy URL must define a port number and have one of the following schemes: `http://`,
 *   `https://`, `socks4://` or `socks5://`.
 *   If the proxy is HTTP (i.e. has the `http://` scheme) and contains username or password,
 *   the `launchPlaywright` functions sets up an anonymous proxy HTTP
 *   to make the proxy work with headless Chrome. For more information, read the
 *   [blog post about proxy-chain library](https://blog.apify.com/how-to-make-headless-chrome-and-puppeteer-use-a-proxy-server-with-authentication-249a21a79212).
 *
 * To use this function, you need to have the [Playwright](https://www.npmjs.com/package/playwright)
 * NPM package installed in your project.
 * When running on the Apify Platform, you can achieve that simply
 * by using the `apify/actor-node-playwright-*` base Docker image for your actor - see
 * [Apify Actor documentation](https://docs.apify.com/actor/build#base-images)
 * for details.
 *
 * @param [launchContext]
 *   Optional settings passed to `browserType.launch()`. In addition to
 *   [Playwright's options](https://playwright.dev/docs/api/class-browsertype?_highlight=launch#browsertypelaunchoptions)
 *   the object may contain our own  {@apilink PlaywrightLaunchContext} that enable additional features.
 * @param [configuration]
 * @returns
 *   Promise that resolves to Playwright's `Browser` instance.
 */
export async function launchPlaywright(launchContext, configuration = Configuration.getGlobalConfiguration()) {
    const playwrightLauncher = new PlaywrightLauncher(launchContext, configuration);
    return playwrightLauncher.launch();
}
