import type { Dictionary } from '@crawlee/types';
import type { BrowserFingerprintWithHeaders } from 'fingerprint-generator';
import type { BrowserPlugin, CommonBrowser, CommonLibrary } from './abstract-classes/browser-plugin';
import type { UnwrapPromise } from './utils';
/**
 * `LaunchContext` holds information about the launched browser. It's useful
 * to retrieve the `launchOptions`, the proxy the browser was launched with
 * or any other information user chose to add to the `LaunchContext` by calling
 * its `extend` function. This is very useful to keep track of browser-scoped
 * values, such as session IDs.
 */
export interface LaunchContextOptions<Library extends CommonLibrary = CommonLibrary, LibraryOptions extends Dictionary | undefined = Parameters<Library['launch']>[0], LaunchResult extends CommonBrowser = UnwrapPromise<ReturnType<Library['launch']>>, NewPageOptions = Parameters<LaunchResult['newPage']>[0], NewPageResult = UnwrapPromise<ReturnType<LaunchResult['newPage']>>> {
    /**
     * To make identification of `LaunchContext` easier, `BrowserPool` assigns
     * the `LaunchContext` an `id` that's equal to the `id` of the page that
     * triggered the browser launch. This is useful, because many pages share
     * a single launch context (single browser).
     */
    id?: string;
    /**
     * The `BrowserPlugin` instance used to launch the browser.
     */
    browserPlugin: BrowserPlugin<Library, LibraryOptions, LaunchResult, NewPageOptions, NewPageResult>;
    /**
     * The actual options the browser was launched with, after changes.
     * Those changes would be typically made in pre-launch hooks.
     */
    launchOptions: LibraryOptions;
    /**
     * By default pages share the same browser context.
     * If set to `true` each page uses its own context that is destroyed once the page is closed or crashes.
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
    proxyUrl?: string;
}
export declare class LaunchContext<Library extends CommonLibrary = CommonLibrary, LibraryOptions extends Dictionary | undefined = Parameters<Library['launch']>[0], LaunchResult extends CommonBrowser = UnwrapPromise<ReturnType<Library['launch']>>, NewPageOptions = Parameters<LaunchResult['newPage']>[0], NewPageResult = UnwrapPromise<ReturnType<LaunchResult['newPage']>>> {
    id?: string;
    browserPlugin: BrowserPlugin<Library, LibraryOptions, LaunchResult, NewPageOptions, NewPageResult>;
    launchOptions: LibraryOptions;
    useIncognitoPages: boolean;
    experimentalContainers: boolean;
    userDataDir: string;
    private _proxyUrl?;
    private readonly _reservedFieldNames;
    fingerprint?: BrowserFingerprintWithHeaders;
    [K: PropertyKey]: unknown;
    constructor(options: LaunchContextOptions<Library, LibraryOptions, LaunchResult, NewPageOptions, NewPageResult>);
    /**
     * Extend the launch context with any extra fields.
     * This is useful to keep state information relevant
     * to the browser being launched. It ensures that
     * no internal fields are overridden and should be
     * used instead of property assignment.
     */
    extend<T extends Record<PropertyKey, unknown>>(fields: T): void;
    /**
     * Sets a proxy URL for the browser.
     * Use `undefined` to unset existing proxy URL.
     */
    set proxyUrl(url: string | undefined);
    /**
     * Returns the proxy URL of the browser.
     */
    get proxyUrl(): string | undefined;
}
//# sourceMappingURL=launch-context.d.ts.map