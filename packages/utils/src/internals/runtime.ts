let warnedAboutBun = false;

/**
 * Detects whether the current process is running under the Bun runtime.
 */
export function isBunRuntime(): boolean {
    return typeof globalThis !== 'undefined' && 'Bun' in globalThis;
}

/**
 * Logs a one-time warning when `got-scraping` based HTTP client is used under Bun.
 * Bun does not fully support `got-scraping`'s tunnel mechanism; users should
 * switch to `ImpitHttpClient` from `@crawlee/impit-client` instead.
 */
export function warnIfBunRuntime(logger?: { warning(msg: string, data?: Record<string, unknown>): void }): void {
    if (!isBunRuntime() || warnedAboutBun) return;
    warnedAboutBun = true;

    const message =
        'Detected Bun runtime. GotScrapingHttpClient is not fully compatible with Bun — ' +
        'proxy tunneling and some Node.js stream APIs may not work. ' +
        'Use ImpitHttpClient from @crawlee/impit-client instead: ' +
        'new CheerioCrawler({ httpClient: new ImpitHttpClient() })';

    if (logger) {
        logger.warning(message);
    } else {
        console.warn(`[crawlee] ${message}`);
    }
}

/** @internal — reset for testing */
export function _resetBunWarning(): void {
    warnedAboutBun = false;
}
