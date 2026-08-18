export class LaunchContext {
    id;
    browserPlugin;
    launchOptions;
    useIncognitoPages;
    browserPerProxy;
    userDataDir;
    isRemote;
    ignoreProxyCertificate;
    #proxyUrl;
    #reservedFieldNames;
    fingerprint;
    /**
     * Token identifying the remote browser session this context connected to, set by the plugin and read by
     * the {@apilink RemoteBrowserPool} to release the session on close. Only present for remote connections.
     * @internal
     */
    remoteToken;
    constructor(options) {
        const { id, browserPlugin, launchOptions, proxyUrl, useIncognitoPages, browserPerProxy, userDataDir = '', ignoreProxyCertificate, isRemote, } = options;
        this.id = id;
        this.browserPlugin = browserPlugin;
        this.launchOptions = launchOptions;
        this.browserPerProxy = browserPerProxy ?? false;
        this.useIncognitoPages = useIncognitoPages ?? false;
        this.userDataDir = userDataDir;
        this.ignoreProxyCertificate = ignoreProxyCertificate ?? false;
        this.isRemote = isRemote ?? false;
        this.#proxyUrl = proxyUrl;
        // Computed here (not in a field initializer) so that all fields already exist; the accessors live on
        // the prototype, so they are never own keys and have to be listed explicitly.
        this.#reservedFieldNames = [...Reflect.ownKeys(this), 'proxyUrl', 'remoteToken', 'extend'];
    }
    /**
     * Extend the launch context with any extra fields.
     * This is useful to keep state information relevant
     * to the browser being launched. It ensures that
     * no internal fields are overridden and should be
     * used instead of property assignment.
     */
    extend(fields) {
        Object.entries(fields).forEach(([key, value]) => {
            if (this.#reservedFieldNames.includes(key)) {
                throw new Error(`Cannot extend LaunchContext with key: ${key}, because it's reserved.`);
            }
            else {
                Reflect.set(this, key, value);
            }
        });
    }
    /**
     * Sets a proxy URL for the browser.
     * Use `undefined` to unset existing proxy URL.
     */
    set proxyUrl(url) {
        if (!url) {
            this.#proxyUrl = undefined;
            return;
        }
        const urlInstance = new URL(url);
        urlInstance.pathname = '/';
        urlInstance.search = '';
        urlInstance.hash = '';
        // https://www.chromium.org/developers/design-documents/network-settings/#command-line-options-for-proxy-settings
        this.#proxyUrl = urlInstance.href.slice(0, -1);
    }
    /**
     * Returns the proxy URL of the browser.
     */
    get proxyUrl() {
        return this.#proxyUrl;
    }
}
