import net from 'node:net';
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';

import type { BrowserController } from '@crawlee/browser-pool';
import { BrowserPlugin } from '@crawlee/browser-pool';
import type { LaunchContext } from '@crawlee/browser-pool';
import { PlaywrightController } from '@crawlee/browser-pool';
import type { BrowserPluginOptions } from '@crawlee/browser-pool';
import type { Browser as PlaywrightBrowser, BrowserType, LaunchOptions } from 'playwright';
import { chromium } from 'playwright';

import log from '@apify/log';

/**
 * Lightpanda-specific configuration passed from `LightpandaLaunchContext` to `LightpandaPlugin`.
 * These options control how the Lightpanda process is started and connected to.
 */
export interface LightpandaConfig {
    /** CDP server host. @default '127.0.0.1' */
    host?: string;
    /** CDP server port. @default 9222 */
    port?: number;
    /**
     * When `true`, the plugin automatically spawns the Lightpanda process.
     * Requires `@lightpanda/browser` to be installed or `lightpandaPath` to be set.
     * When `false`, the plugin assumes Lightpanda is already running at `host:port`.
     * @default true
     */
    autoStart?: boolean;
    /**
     * Explicit path to the Lightpanda binary.
     * Used when `@lightpanda/browser` is not installed and `autoStart` is `true`.
     */
    lightpandaPath?: string;
    /**
     * Lightpanda server inactivity timeout in seconds.
     * Passed as `--timeout` to the Lightpanda process.
     */
    timeout?: number;
    /**
     * If `true`, passes `--obey_robots` to the Lightpanda process.
     */
    obeyRobots?: boolean;
}

export interface LightpandaPluginOptions extends BrowserPluginOptions<LaunchOptions> {
    lightpandaConfig?: LightpandaConfig;
}

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 9222;
const STARTUP_POLL_INTERVAL_MS = 100;
const STARTUP_TIMEOUT_MS = 30_000;

/**
 * Polls a TCP port until it accepts connections or the timeout is reached.
 * Used to wait for the Lightpanda process to be ready before connecting via CDP.
 */
async function waitForPort(host: string, port: number, timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    let lastError: Error | undefined;

    while (Date.now() < deadline) {
        try {
            await new Promise<void>((resolve, reject) => {
                const socket = net.createConnection({ host, port }, () => {
                    socket.destroy();
                    resolve();
                });
                socket.once('error', (err) => {
                    socket.destroy();
                    reject(err);
                });
            });
            return; // connected successfully
        } catch (err) {
            lastError = err as Error;
            await new Promise((resolve) => setTimeout(resolve, STARTUP_POLL_INTERVAL_MS));
        }
    }

    throw new Error(
        `Lightpanda server did not start on ${host}:${port} within ${timeoutMs}ms. ` +
            `Last error: ${lastError?.message ?? 'unknown'}`,
    );
}

/**
 * Attempts to spawn the Lightpanda process via the `@lightpanda/browser` npm package.
 * Returns the spawned ChildProcess, or `null` if the package is not installed.
 */
async function trySpawnViaPackage(
    host: string,
    port: number,
    proxyUrl: string | undefined,
    obeyRobots: boolean,
): Promise<ChildProcess | null> {
    try {
        // Dynamic import prevents hard errors when @lightpanda/browser is not installed.
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const pkg: { lightpanda: { serve(opts: { host: string; port: number }): Promise<ChildProcess> } } =
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (await import('@lightpanda/browser' as any)) as any;
        const proc: ChildProcess = await pkg.lightpanda.serve({ host, port });

        if (proxyUrl) {
            log.warning(
                'LightpandaCrawler: @lightpanda/browser may not support --http_proxy. ' +
                    'For full proxy support, set lightpandaPath to use child_process.spawn directly.',
            );
        }

        if (obeyRobots) {
            log.warning(
                'LightpandaCrawler: @lightpanda/browser may not support --obey_robots. ' +
                    'For full CLI flag support, set lightpandaPath to use child_process.spawn directly.',
            );
        }

        return proc;
    } catch {
        return null;
    }
}

/**
 * Spawns the Lightpanda binary at `lightpandaPath` using `child_process.spawn`.
 */
function spawnViaBinary(
    lightpandaPath: string,
    host: string,
    port: number,
    proxyUrl: string | undefined,
    timeout: number | undefined,
    obeyRobots: boolean,
): ChildProcess {
    const args: string[] = ['serve', '--host', host, '--port', String(port)];

    if (proxyUrl) args.push('--http_proxy', proxyUrl);
    if (timeout !== undefined) args.push('--timeout', String(timeout));
    if (obeyRobots) args.push('--obey_robots');

    const proc = spawn(lightpandaPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });

    proc.stderr?.on('data', (data: Buffer) => {
        log.debug(`Lightpanda stderr: ${data.toString().trim()}`);
    });

    proc.stdout?.on('data', (data: Buffer) => {
        log.debug(`Lightpanda stdout: ${data.toString().trim()}`);
    });

    return proc;
}

/**
 * `LightpandaPlugin` integrates the Lightpanda headless browser with Crawlee's BrowserPool.
 *
 * Instead of launching a Chromium binary, it connects to a Lightpanda CDP server via
 * `chromium.connectOverCDP()`. When `autoStart: true` (default), it manages the Lightpanda
 * process lifecycle automatically.
 *
 * @ignore
 */
export class LightpandaPlugin extends BrowserPlugin<BrowserType, LaunchOptions, PlaywrightBrowser> {
    readonly lightpandaConfig: Required<Pick<LightpandaConfig, 'host' | 'port' | 'autoStart' | 'obeyRobots'>> &
        LightpandaConfig;

    // Tracks spawned processes so they can be cleaned up on browser disconnect.
    private readonly managedProcesses: WeakMap<PlaywrightBrowser, ChildProcess> = new WeakMap();

    constructor(library: BrowserType, options: LightpandaPluginOptions = {}) {
        const { lightpandaConfig = {}, ...browserPluginOptions } = options;
        super(library, browserPluginOptions);

        this.lightpandaConfig = {
            host: DEFAULT_HOST,
            port: DEFAULT_PORT,
            autoStart: true,
            obeyRobots: false,
            ...lightpandaConfig,
        };
    }

    protected async _launch(launchContext: LaunchContext<BrowserType>): Promise<PlaywrightBrowser> {
        const { host, port, autoStart, lightpandaPath, timeout, obeyRobots } = this.lightpandaConfig;
        const { proxyUrl } = launchContext;

        let proc: ChildProcess | undefined;

        if (autoStart) {
            if (process.platform !== 'linux') {
                throw new Error(
                    `LightpandaCrawler: Spawning Lightpanda is only supported on Linux (current platform: ${process.platform}). ` +
                        'Use autoStart: false and run Lightpanda separately (e.g. via Docker: docker run -p 9222:9222 lightpanda/browser:nightly). ' +
                        'See https://lightpanda.io/docs/open-source/installation#install-from-docker',
                );
            }

            if (lightpandaPath) {
                // Explicit binary path – unconditionally use child_process.spawn for full CLI flag support.
                proc = spawnViaBinary(lightpandaPath, host, port, proxyUrl, timeout, obeyRobots);
            } else {
                // Try @lightpanda/browser first; fall back to a descriptive error.
                const packageProc = await trySpawnViaPackage(host, port, proxyUrl, obeyRobots);
                if (packageProc) {
                    proc = packageProc;
                } else {
                    this._throwAugmentedLaunchError(
                        new Error(
                            'Could not start Lightpanda: @lightpanda/browser is not installed and lightpandaPath is not set.',
                        ),
                        undefined,
                        'n/a',
                        'Install @lightpanda/browser (`npm install @lightpanda/browser`) or set launchContext.lightpandaPath to the Lightpanda binary.',
                    );
                }
            }

            // Wait for the CDP server to be ready before connecting.
            try {
                await waitForPort(host, port, STARTUP_TIMEOUT_MS);
            } catch (err) {
                proc!.kill();
                throw err;
            }
        }

        const cdpUrl = `ws://${host}:${port}`;

        let browser: PlaywrightBrowser;
        try {
            browser = await chromium.connectOverCDP(cdpUrl) as unknown as PlaywrightBrowser;
        } catch (err) {
            proc?.kill();
            throw err;
        }

        if (proc) {
            this.managedProcesses.set(browser, proc);

            // On unexpected process exit (non-zero code), this is a fatal condition.
            proc.once('exit', (code, signal) => {
                if (code !== 0 && code !== null) {
                    log.error(
                        `Lightpanda process exited unexpectedly (code ${code}, signal ${signal}). ` +
                            'This is a fatal error – the crawler will stop.',
                    );
                }
            });
        }

        // Clean up the managed process when the browser disconnects.
        browser.on?.('disconnected', () => {
            const managedProc = this.managedProcesses.get(browser);
            if (managedProc && !managedProc.killed) {
                managedProc.stdout?.destroy();
                managedProc.stderr?.destroy();
                managedProc.kill();
            }
            this.managedProcesses.delete(browser);
        });

        return browser;
    }

    /**
     * Must return `false` to prevent `BrowserPlugin.launch()` from injecting Chromium-specific
     * CLI args (--disable-blink-features, --user-agent) into `launchOptions` before the CDP
     * connection is made. Those args are meaningless for a `connectOverCDP` call and would break it.
     */
    protected _isChromiumBasedBrowser(_launchContext?: LaunchContext<BrowserType>): boolean {
        return false;
    }

    /**
     * Proxy for Lightpanda is passed as `--http_proxy` at process spawn time (in `_launch`),
     * not as a `launchOptions` property. This method is intentionally a no-op.
     */
    protected async _addProxyToLaunchOptions(_launchContext: LaunchContext<BrowserType>): Promise<void> {
        // No-op: proxy is handled during process spawn via the `--http_proxy` CLI flag.
    }

    protected _createController(): BrowserController<BrowserType, LaunchOptions, PlaywrightBrowser> {
        return new PlaywrightController(this as any) as unknown as BrowserController<
            BrowserType,
            LaunchOptions,
            PlaywrightBrowser
        >;
    }
}
