import type { Dictionary } from '@crawlee/types';

export { ArgumentValidationError, parseArgument } from '@apify/validations';

/**
 * Rejects options that exist only to configure the browser pool the crawler would have built for itself.
 * Accepting them alongside a pre-built `browserPool` and quietly ignoring them is how `browserPoolOptions` grew
 * into a second, half-working way of configuring the same pool.
 * @internal
 */
export function assertBrowserPoolNotConfigured(crawlerName: string, ignoredOptions: Dictionary): void {
    const names = Object.keys(ignoredOptions).filter((name) => ignoredOptions[name] !== undefined);

    if (names.length === 0) {
        return;
    }

    throw new Error(
        `${crawlerName}: ${names.map((name) => `\`${name}\``).join(', ')} cannot be combined with \`browserPool\`, ` +
            `${names.length > 1 ? 'they configure' : 'it configures'} the browser pool the crawler would build for ` +
            'itself. Configure the pool you pass in instead.',
    );
}
