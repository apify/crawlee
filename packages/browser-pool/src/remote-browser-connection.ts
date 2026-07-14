import { BrowserLaunchError } from './errors.js';
import type { RemoteConnection, RemoteConnectionParameters } from './remote-browser-pool.js';
import { sanitizeEndpointForLog } from './utils.js';

/**
 * Connects a {@apilink BrowserPlugin} to a remote browser service. Resolves the endpoint via the injected
 * {@apilink RemoteConnection}, stores the session token on the launch context (so {@apilink RemoteBrowserPool}
 * can release it on close), runs the library-specific `connect` callback, and on failure releases the session
 * and wraps the error in a {@apilink BrowserLaunchError}.
 *
 * The plugin owns only the library-specific `connect()` call — all remote-session policy lives here, not on
 * the abstract base plugin.
 *
 * @internal
 */
export class RemoteBrowserConnection {
    constructor(
        private readonly connection: RemoteConnection,
        readonly parameters: RemoteConnectionParameters = {},
    ) {}

    async connect<LaunchResult>(
        launchContext: { proxyUrl?: string; _remoteToken?: number },
        connect: (url: string) => Promise<LaunchResult>,
    ): Promise<LaunchResult> {
        let url: string;
        let token: number;
        try {
            ({ url, token } = await this.connection.resolve({ proxyUrl: launchContext.proxyUrl }));
        } catch (cause) {
            throw new BrowserLaunchError('Failed to resolve the remote browser endpoint.', { cause });
        }

        launchContext._remoteToken = token;

        try {
            return await connect(url);
        } catch (cause) {
            await this.connection.release(token);
            throw new BrowserLaunchError(
                `Failed to connect to remote browser at "${sanitizeEndpointForLog(url)}". ` +
                    'Check that the endpoint is reachable and accepts the configured protocol.',
                { cause },
            );
        }
    }
}
