export function launchPuppeteer(options?: LaunchPuppeteerOptions | undefined): Promise<Browser>;
/**
 * Apify extends the launch options of Puppeteer.
 * You can use any of the Puppeteer compatible
 * [`LaunchOptions`](https://pptr.dev/#?product=Puppeteer&show=api-puppeteerlaunchoptions)
 * options in the  {@link Apify#launchPuppeteer}
 * function and in addition, all the options available below.
 */
export type LaunchPuppeteerOptions = {
    /**
     * URL to a HTTP proxy server. It must define the port number,
     * and it may also contain proxy username and password.
     *
     * Example: `http://bob:pass123@proxy.example.com:1234`.
     */
    proxyUrl?: string;
    /**
     * The `User-Agent` HTTP header used by the browser.
     * If not provided, the function sets `User-Agent` to a reasonable default
     * to reduce the chance of detection of the crawler.
     */
    userAgent?: string;
    /**
     * If `true` and `executablePath` is not set,
     * Puppeteer will launch full Google Chrome browser available on the machine
     * rather than the bundled Chromium. The path to Chrome executable
     * is taken from the `APIFY_CHROME_EXECUTABLE_PATH` environment variable if provided,
     * or defaults to the typical Google Chrome executable location specific for the operating system.
     * By default, this option is `false`.
     */
    useChrome?: boolean;
    /**
     * If set to `true`, Puppeteer will be configured to use
     * [Apify Proxy](https://my.apify.com/proxy) for all connections.
     * For more information, see the [documentation](https://docs.apify.com/proxy)
     */
    useApifyProxy?: boolean;
    /**
     * An array of proxy groups to be used
     * by the [Apify Proxy](https://docs.apify.com/proxy).
     * Only applied if the `useApifyProxy` option is `true`.
     */
    apifyProxyGroups?: string[];
    /**
     * Apify Proxy session identifier to be used by all the Chrome browsers.
     * All HTTP requests going through the proxy with the same session identifier
     * will use the same target proxy server (i.e. the same IP address).
     * The identifier can only contain the following characters: `0-9`, `a-z`, `A-Z`, `"."`, `"_"` and `"~"`.
     * Only applied if the `useApifyProxy` option is `true`.
     */
    apifyProxySession?: string;
    /**
     * Either a require path (`string`) to a package to be used instead of default `puppeteer`,
     * or an already required module (`Object`). This enables usage of various Puppeteer
     * wrappers such as `puppeteer-extra`.
     *
     * Take caution, because it can cause all kinds of unexpected errors and weird behavior.
     * Apify SDK is not tested with any other library besides `puppeteer` itself.
     */
    puppeteerModule?: string | Object;
    /**
     * This setting hides most of the known properties that identify headless Chrome and makes it nearly undetectable.
     * It is recommended to use it together with the `useChrome` set to `true`.
     */
    stealth?: boolean;
    /**
     * Using this configuration, you can disable some of the hiding tricks.
     * For these settings to take effect `stealth` must be set to true
     */
    stealthOptions?: StealthOptions;
};
import { Browser } from "puppeteer";
import { StealthOptions } from "./stealth/stealth";
