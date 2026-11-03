import type { CrawleeLogger } from '@crawlee/core';

import { BrowserLaunchError } from './abstract-classes/browser-plugin.js';
import { RemoteBrowserProvider } from './remote-browser-provider.js';
import { sanitizeEndpointForLog } from './utils.js';

/**
 * The result of resolving a remote browser endpoint: the URL to connect to plus an optional opaque
 * `context` object that is handed back to `release`.
 */
export interface ResolvedRemoteEndpoint {
    /** The WebSocket / CDP URL to connect to. */
    url: string;
    /** Opaque per-session data (e.g. a session ID) passed back to `release`. */
    context?: Record<string, unknown>;
}

/**
 * A remote browser endpoint: either a static URL string, or a function called once per browser launch
 * that returns the URL (optionally with a `context` for `release`). The function receives the proxy URL
 * Crawlee resolved for the browser, so it can be forwarded to services that accept an external proxy.
 */
export type RemoteBrowserEndpoint =
    | string
    | ((options?: { proxyUrl?: string }) => string | ResolvedRemoteEndpoint | Promise<string | ResolvedRemoteEndpoint>);

/** Options shared by all remote browser plugins. */
export interface RemoteBrowserOptions {
    /**
     * The remote browser endpoint: a static URL, a function returning one per launch, or a
     * {@apilink RemoteBrowserProvider} instance encapsulating a session create/release lifecycle.
     */
    endpoint: RemoteBrowserEndpoint | RemoteBrowserProvider<any>;
    /**
     * Cleanup callback invoked when the browser disconnects or the connection fails right after the endpoint
     * resolved. Receives the `context` returned by a function endpoint. Errors are caught and logged. Ignored
     * when `endpoint` is a {@apilink RemoteBrowserProvider} (its own `release()` is used instead).
     */
    release?: (info: { endpoint: string; context?: Record<string, unknown> }) => unknown;
    /** Extra options forwarded to the library `connect()` call (endpoint excluded). */
    connectOptions?: Record<string, unknown>;
}

/**
 * Resolves `endpoint` for one launch, runs the library-specific `connect`, and ties the session's `release` to
 * the browser's `disconnected` event. On connect failure the session is released and the error is wrapped in a
 * {@apilink BrowserLaunchError}.
 *
 * @internal
 */
export async function connectRemoteBrowser<
    Browser extends { on(event: 'disconnected', listener: () => void): unknown },
>(
    options: RemoteBrowserOptions,
    proxyUrl: string | undefined,
    log: CrawleeLogger,
    connect: (url: string) => Promise<Browser>,
): Promise<Browser> {
    let resolved: ResolvedRemoteEndpoint;
    try {
        resolved = await resolveEndpoint(options.endpoint, proxyUrl);
    } catch (cause) {
        throw new BrowserLaunchError('Failed to resolve the remote browser endpoint.', { cause });
    }

    let released = false;
    const release = async () => {
        if (released) return;
        released = true;
        try {
            if (options.endpoint instanceof RemoteBrowserProvider) {
                await options.endpoint.release(resolved.context ?? {});
            } else {
                await options.release?.({ endpoint: resolved.url, context: resolved.context });
            }
        } catch (err) {
            log.warning('Remote browser release() failed.', { error: (err as Error)?.message });
        }
    };

    let browser: Browser;
    try {
        browser = await connect(resolved.url);
    } catch (cause) {
        await release();
        throw new BrowserLaunchError(
            `Failed to connect to remote browser at "${sanitizeEndpointForLog(resolved.url)}". ` +
                'Check that the endpoint is reachable and accepts the configured protocol.',
            { cause },
        );
    }

    browser.on('disconnected', release);
    return browser;
}

async function resolveEndpoint(
    endpoint: RemoteBrowserOptions['endpoint'],
    proxyUrl: string | undefined,
): Promise<ResolvedRemoteEndpoint> {
    const resolved =
        endpoint instanceof RemoteBrowserProvider
            ? await endpoint.connect({ proxyUrl })
            : typeof endpoint === 'function'
              ? await endpoint({ proxyUrl })
              : endpoint;

    if (typeof resolved === 'string') {
        if (!resolved) throw new Error('Remote browser endpoint resolved to an empty string.');
        return { url: resolved };
    }
    if (!resolved?.url) {
        throw new Error("Remote browser endpoint() must return a URL string or an object with a non-empty 'url'.");
    }
    return resolved;
}
